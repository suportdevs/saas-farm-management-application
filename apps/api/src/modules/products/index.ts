import { and, eq } from 'drizzle-orm';
import { db, defineModule, notDeleted, softDeleted } from '../../core';
import { farmExtensions } from '../farms';
import { brands, categories, colors, products, productSizes, sizes, units } from './models';
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
  setup() {
    // A deleted farm's catalog is marked deleted with it (rows are kept).
    farmExtensions.onDeleting(async (farm) => {
      const deleted = softDeleted();
      await db.transaction(async (tx) => {
        for (const table of [productSizes, products, categories, brands, units, sizes, colors]) {
          await tx.update(table).set(deleted).where(and(eq(table.tenantId, farm.id), notDeleted(table)));
        }
      });
    });
  },
});
