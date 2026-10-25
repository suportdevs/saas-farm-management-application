import express, { Router } from 'express';
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
} from '@kit/shared';
import { limiter, validate } from '../../../core';
import { requireFarm } from '../../farms';
import { catalogController } from '../controllers/catalog.controller';
import { catalogs } from '../services/catalog-definitions';
import type { Catalog } from '../services/catalog.service';

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
  const c = catalogController(catalog);

  router.get('/', can.view, validate(catalogListSchema(resource), 'query'), c.list);
  router.get('/export', can.export, validate(catalogFilterSchema(resource), 'query'), c.export);
  router.get('/options', can.view, validate(catalogOptionsSchema(resource), 'query'), c.options);
  router.post('/', can.create, validate(input), c.create);
  router.post('/import', can.import, importLimiter, validate(catalogImportSchema(resource)), c.import);
  router.post('/bulk-delete', can.delete, validate(bulkKeysSchema), c.bulkDelete);
  if (hasStatus(resource)) router.post('/toggle-status', can.update, validate(bulkKeysSchema), c.toggleStatus);
  if (CATALOG[resource].image) {
    router.get('/:key/image', can.view, c.showImage);
    router.put('/:key/image', can.update, uploadLimiter, imageBody, c.setImage);
    router.delete('/:key/image', can.update, c.removeImage);
  }
  router.put('/:key', can.update, validate(input), c.update);
  router.delete('/:key', can.delete, c.remove);

  return router;
}

/** Mounted at /api/farms — each catalog at /api/farms/:farm/products/<resource>. */
export const router = Router();

for (const catalog of catalogs) router.use(`/:farm/${catalogPath(catalog.resource)}`, catalogRouter(catalog));
