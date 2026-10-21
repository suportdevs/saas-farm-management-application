import express, { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  bulkKeysSchema,
  CATALOG,
  catalogFilterSchema,
  catalogImportSchema,
  catalogListSchema,
  catalogOptionsSchema,
  catalogPath,
  catalogSchemas,
  hasStatus,
  IMAGE_MAX_BYTES,
  type CatalogFilters,
  type CatalogListQuery,
} from '@kit/shared';
import { audit, badRequest, limiter, notFound, validate } from '../../core';
import { getFarm, requireFarm } from '../farms';
import type { Catalog, Tenant } from './catalog';
import { catalogs } from './catalogs';
import { sniffImage } from './images';

const importLimiter = limiter({ name: 'catalog-import', windowMs: 60 * 60 * 1000, limit: 30 });
const uploadLimiter = limiter({ name: 'catalog-upload', windowMs: 60 * 60 * 1000, limit: 200 });
/** One per-action key per endpoint group. */
const can = {
  view: requireFarm('products.view'),
  create: requireFarm('products.create'),
  update: requireFarm('products.update'),
  delete: requireFarm('products.delete'),
  import: requireFarm('products.import'),
  export: requireFarm('products.export'),
};
/** Image uploads arrive as the raw file body (Content-Type: image/*). */
const imageBody = express.raw({ type: 'image/*', limit: IMAGE_MAX_BYTES });

const tenantOf = (res: Response): Tenant => {
  const { farm } = getFarm(res);
  return { id: farm.id, timezone: farm.timezone };
};

const keyParam = (req: Request) => {
  const key = z.uuid().safeParse(req.params.key);
  if (!key.success) throw notFound();
  return key.data;
};

/**
 * The same endpoints for every catalog:
 *
 *   GET    /               paginated list (?q, filters, page, pageSize)
 *   GET    /export         every matching row (?q, filters) — export and print
 *   GET    /options        searchable select choices (?q, filters, or ?keys)
 *   POST   /               create
 *   POST   /import         { rows } — all or nothing
 *   POST   /bulk-delete    { keys }
 *   POST   /toggle-status  { keys } — flips active ↔ inactive (catalogs with a status)
 *   PUT    /:key           update
 *   DELETE /:key           delete
 *   GET|PUT|DELETE /:key/image   (catalogs with images; PUT takes the raw file)
 */
function catalogRouter(catalog: Catalog) {
  const router = Router({ mergeParams: true });
  const { resource } = catalog;
  const input = catalogSchemas[resource];

  /** Writes to the farm's activity log. */
  const record = (
    req: Request,
    tenantId: string,
    action: string,
    metadata: Record<string, unknown>,
  ) =>
    audit(req, {
      action: `products.${action}`,
      targetType: 'farm',
      targetId: tenantId,
      metadata: { resource, ...metadata },
    });

  router.get(
    '/',
    can.view,
    validate(catalogListSchema(resource), 'query'),
    async (req, res) => {
      res.json(await catalog.list(tenantOf(res), req.query as unknown as CatalogListQuery));
    },
  );

  router.get(
    '/export',
    can.export,
    validate(catalogFilterSchema(resource), 'query'),
    async (req, res) => {
      res.json({
        rows: await catalog.export(tenantOf(res), req.query as unknown as CatalogFilters),
      });
    },
  );

  router.get(
    '/options',
    can.view,
    validate(catalogOptionsSchema(resource), 'query'),
    async (req, res) => {
      const query = req.query as unknown as CatalogFilters & { keys?: string[] };
      res.json({ options: await catalog.options(tenantOf(res), query) });
    },
  );

  router.post('/', can.create, validate(input), async (req, res) => {
    const tenantId = getFarm(res).farm.id;
    const row = await catalog.create(tenantId, req.auth!.user.id, req.body);
    await record(req, tenantId, 'created', { name: req.body.name });
    res.status(201).json(row);
  });

  router.post(
    '/import',
    can.import,
    importLimiter,
    validate(catalogImportSchema(resource)),
    async (req, res) => {
      const tenantId = getFarm(res).farm.id;
      const imported = await catalog.import(tenantId, req.auth!.user.id, req.body.rows);
      await record(req, tenantId, 'imported', { count: imported });
      res.status(201).json({ imported });
    },
  );

  router.post('/bulk-delete', can.delete, validate(bulkKeysSchema), async (req, res) => {
    const { keys } = req.body as z.infer<typeof bulkKeysSchema>;
    const tenantId = getFarm(res).farm.id;
    const deleted = await catalog.remove(tenantId, req.auth!.user.id, keys);
    await record(req, tenantId, 'deleted', { count: deleted });
    res.json({ deleted });
  });

  if (hasStatus(resource)) {
    router.post('/toggle-status', can.update, validate(bulkKeysSchema), async (req, res) => {
      const { keys } = req.body as z.infer<typeof bulkKeysSchema>;
      const tenantId = getFarm(res).farm.id;
      const updated = await catalog.toggleStatus(tenantId, req.auth!.user.id, keys);
      await record(req, tenantId, 'status_changed', { count: updated });
      res.json({ updated });
    });
  }

  if (CATALOG[resource].image) {
    router.get('/:key/image', can.view, async (req, res) => {
      const image = await catalog.image(getFarm(res).farm.id, keyParam(req));
      if (!image) throw notFound('No image');
      // URLs carry the file name as ?v=, so a changed image gets a new URL.
      res.set({
        'Content-Type': image.type,
        'Cache-Control': 'private, max-age=31536000, immutable',
      });
      res.send(image.data);
    });

    router.put('/:key/image', can.update, uploadLimiter, imageBody, async (req, res) => {
      const data = Buffer.isBuffer(req.body) ? req.body : null;
      const type = data && sniffImage(data);
      if (!data || !type)
        throw badRequest('Upload a JPEG, PNG, WebP or GIF image', 'INVALID_IMAGE');
      const tenantId = getFarm(res).farm.id;
      const image = await catalog.setImage(tenantId, req.auth!.user.id, keyParam(req), {
        data,
        type,
      });
      await record(req, tenantId, 'updated', { image: 'changed' });
      res.json({ image });
    });

    router.delete('/:key/image', can.update, async (req, res) => {
      const tenantId = getFarm(res).farm.id;
      await catalog.setImage(tenantId, req.auth!.user.id, keyParam(req), null);
      await record(req, tenantId, 'updated', { image: 'removed' });
      res.status(204).end();
    });
  }

  router.put('/:key', can.update, validate(input), async (req, res) => {
    const tenantId = getFarm(res).farm.id;
    const row = await catalog.update(tenantId, req.auth!.user.id, keyParam(req), req.body);
    await record(req, tenantId, 'updated', { name: req.body.name });
    res.json(row);
  });

  router.delete('/:key', can.delete, async (req, res) => {
    const tenantId = getFarm(res).farm.id;
    await catalog.remove(tenantId, req.auth!.user.id, [keyParam(req)]);
    await record(req, tenantId, 'deleted', { count: 1 });
    res.status(204).end();
  });

  return router;
}

export const router = Router();

for (const catalog of catalogs)
  router.use(`/:farm/${catalogPath(catalog.resource)}`, catalogRouter(catalog));
