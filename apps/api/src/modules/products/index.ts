import { defineModule } from '../../core';
import { router } from './routes/catalog.routes';

/**
 * Products — the farm's product catalog (products, product sizes, categories, brands,
 * units, sizes, colors). Each catalog is a `Catalog` definition in
 * services/catalog-definitions.ts; one controller and router serve every catalog,
 * and validation and import/export come from the shared engine (services/catalog.service.ts).
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
} from './services/catalog-definitions';
export type { Catalog, Tenant } from './services/catalog.service';
export { brands, categories, colors, products, productSizes, sizes, units } from './models';

export default defineModule({
  name: 'products',
  // Farm-scoped: /api/farms/:farm/products…
  basePath: 'farms',
  router,
});
