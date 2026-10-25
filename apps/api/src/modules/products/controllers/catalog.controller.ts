import type { Request, Response } from 'express';
import { z } from 'zod';
import type { bulkKeysSchema, CatalogFilters, CatalogListQuery } from '@kit/shared';
import { audit, badRequest, notFound } from '../../../core';
import { getFarm } from '../../farms';
import type { Catalog, Tenant } from '../services/catalog.service';
import { sniffImage } from '../services/image.service';

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
 * The same request handlers for every catalog (products, categories, brands…);
 * the catalog's engine does the work.
 */
export function catalogController(catalog: Catalog) {
  const { resource } = catalog;

  /** Writes to the farm's activity log. */
  const record = (req: Request, tenantId: string, action: string, metadata: Record<string, unknown>) =>
    audit(req, {
      action: `products.${action}`,
      targetType: 'farm',
      targetId: tenantId,
      metadata: { resource, ...metadata },
    });

  return {
    /** GET / — paginated list (?q, filters, page, pageSize). */
    async list(req: Request, res: Response) {
      res.json(await catalog.list(tenantOf(res), req.query as unknown as CatalogListQuery));
    },

    /** GET /export — every matching row, for export and print. */
    async export(req: Request, res: Response) {
      res.json({ rows: await catalog.export(tenantOf(res), req.query as unknown as CatalogFilters) });
    },

    /** GET /options — searchable select choices (?q, filters, or ?keys). */
    async options(req: Request, res: Response) {
      const query = req.query as unknown as CatalogFilters & { keys?: string[] };
      res.json({ options: await catalog.options(tenantOf(res), query) });
    },

    /** POST / */
    async create(req: Request, res: Response) {
      const tenantId = getFarm(res).farm.id;
      const row = await catalog.create(tenantId, req.auth!.user.id, req.body);
      await record(req, tenantId, 'created', { name: req.body.name });
      res.status(201).json(row);
    },

    /** POST /import — { rows }, all or nothing. */
    async import(req: Request, res: Response) {
      const tenantId = getFarm(res).farm.id;
      const imported = await catalog.import(tenantId, req.auth!.user.id, req.body.rows);
      await record(req, tenantId, 'imported', { count: imported });
      res.status(201).json({ imported });
    },

    /** POST /bulk-delete — { keys } */
    async bulkDelete(req: Request, res: Response) {
      const { keys } = req.body as z.infer<typeof bulkKeysSchema>;
      const tenantId = getFarm(res).farm.id;
      const deleted = await catalog.remove(tenantId, req.auth!.user.id, keys);
      await record(req, tenantId, 'deleted', { count: deleted });
      res.json({ deleted });
    },

    /** POST /toggle-status — { keys }, flips active ↔ inactive. */
    async toggleStatus(req: Request, res: Response) {
      const { keys } = req.body as z.infer<typeof bulkKeysSchema>;
      const tenantId = getFarm(res).farm.id;
      const updated = await catalog.toggleStatus(tenantId, req.auth!.user.id, keys);
      await record(req, tenantId, 'status_changed', { count: updated });
      res.json({ updated });
    },

    /** GET /:key/image */
    async showImage(req: Request, res: Response) {
      const image = await catalog.image(getFarm(res).farm.id, keyParam(req));
      if (!image) throw notFound('No image');
      // URLs carry the file name as ?v=, so a changed image gets a new URL.
      res.set({
        'Content-Type': image.type,
        'Cache-Control': 'private, max-age=31536000, immutable',
      });
      res.send(image.data);
    },

    /** PUT /:key/image — the raw file body. */
    async setImage(req: Request, res: Response) {
      const data = Buffer.isBuffer(req.body) ? req.body : null;
      const type = data && sniffImage(data);
      if (!data || !type) throw badRequest('Upload a JPEG, PNG, WebP or GIF image', 'INVALID_IMAGE');
      const tenantId = getFarm(res).farm.id;
      const image = await catalog.setImage(tenantId, req.auth!.user.id, keyParam(req), { data, type });
      await record(req, tenantId, 'updated', { image: 'changed' });
      res.json({ image });
    },

    /** DELETE /:key/image */
    async removeImage(req: Request, res: Response) {
      const tenantId = getFarm(res).farm.id;
      await catalog.setImage(tenantId, req.auth!.user.id, keyParam(req), null);
      await record(req, tenantId, 'updated', { image: 'removed' });
      res.status(204).end();
    },

    /** PUT /:key */
    async update(req: Request, res: Response) {
      const tenantId = getFarm(res).farm.id;
      const row = await catalog.update(tenantId, req.auth!.user.id, keyParam(req), req.body);
      await record(req, tenantId, 'updated', { name: req.body.name });
      res.json(row);
    },

    /** DELETE /:key */
    async remove(req: Request, res: Response) {
      const tenantId = getFarm(res).farm.id;
      await catalog.remove(tenantId, req.auth!.user.id, [keyParam(req)]);
      await record(req, tenantId, 'deleted', { count: 1 });
      res.status(204).end();
    },
  };
}
