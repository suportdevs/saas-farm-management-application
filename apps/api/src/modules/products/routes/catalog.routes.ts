import express, { Router } from 'express';
import {
  bulkKeysSchema,
  CATALOG,
  catalogFilterSchema,
  catalogImportSchema,
  catalogListSchema,
  catalogOptionsSchema,
  catalogPath,
  catalogPermission,
  permissionsWithAction,
  type CatalogAction,
  type CatalogResource,
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
/**
 * One key per endpoint group, per catalog: categories need
 * `products.category_create` to create, units `products.unit_create`, …
 */
function permissionsFor(resource: CatalogResource) {
  const key = (action: CatalogAction) => requireFarm(catalogPermission(resource, action));
  return {
    list: key('list'),
    create: key('create'),
    edit: key('edit'),
    delete: key('delete'),
    import: key('import'),
    export: key('export'),
    // Select choices: the catalog's own list, or any create / edit in the module
    // (the product form picks a category and unit without listing them).
    options: requireFarm([
      catalogPermission(resource, 'list'),
      ...permissionsWithAction(CATALOG[resource].module, 'create'),
      ...permissionsWithAction(CATALOG[resource].module, 'edit'),
    ]),
  };
}
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
export function catalogRouter(catalog: Catalog) {
  const router = Router({ mergeParams: true });
  const { resource } = catalog;
  const input = catalogSchemas[resource];
  const c = catalogController(catalog);
  const can = permissionsFor(resource);

  router.get('/', can.list, validate(catalogListSchema(resource), 'query'), c.list);
  router.get('/export', can.export, validate(catalogFilterSchema(resource), 'query'), c.export);
  router.get('/options', can.options, validate(catalogOptionsSchema(resource), 'query'), c.options);
  router.post('/', can.create, validate(input), c.create);
  router.post('/import', can.import, importLimiter, validate(catalogImportSchema(resource)), c.import);
  router.post('/bulk-delete', can.delete, validate(bulkKeysSchema), c.bulkDelete);
  if (hasStatus(resource)) router.post('/toggle-status', can.edit, validate(bulkKeysSchema), c.toggleStatus);
  if (CATALOG[resource].image) {
    router.get('/:key/image', can.list, c.showImage);
    router.put('/:key/image', can.edit, uploadLimiter, imageBody, c.setImage);
    router.delete('/:key/image', can.edit, c.removeImage);
  }
  router.put('/:key', can.edit, validate(input), c.update);
  router.delete('/:key', can.delete, c.remove);

  return router;
}

/** Mounted at /api/farms — each catalog at /api/farms/:farm/products/<resource>. */
export const router = Router();

for (const catalog of catalogs) router.use(`/:farm/${catalogPath(catalog.resource)}`, catalogRouter(catalog));
