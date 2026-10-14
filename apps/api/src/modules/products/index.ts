import { defineModule } from '../../core';
import { router } from './routes';

/**
 * Products — the farm's product catalog (products, product sizes, categories, brands,
 * units, sizes, colors). Each catalog is a `Catalog` definition in catalogs.ts; the
 * routes, validation and import/export come from the shared engine.
 *
 * Public API for other modules (import from '../products' only):
 */
export {
  brandCatalog,
  categoryCatalog,
  colorCatalog,
  productCatalog,
  productSizeCatalog,
  sizeCatalog,
  unitCatalog,
} from './catalogs';
export type { Catalog, Tenant } from './catalog';
export { brands, categories, colors, products, productSizes, sizes, units } from './schema';

export default defineModule({
  name: 'products',
  // Farm-scoped: /api/farms/:farm/products…
  basePath: 'farms',
  router,
});
