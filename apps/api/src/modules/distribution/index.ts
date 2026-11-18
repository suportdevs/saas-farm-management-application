import { and, eq } from 'drizzle-orm';
import { db, defineModule, notDeleted, softDeleted } from '../../core';
import { farmExtensions } from '../farms';
import { customers, customerTypes, suppliers, supplierTypes } from './models';
import { router } from './routes/distribution.routes';

/**
 * Distribution — suppliers, customers and their types. All are catalogs on the
 * shared engine from the products module (definitions in
 * services/distribution-catalogs.ts, columns in the shared distribution/catalog.ts).
 *
 * Public API for other modules (import from '../distribution' only):
 */
export { customerCatalog, customerTypeCatalog, supplierCatalog, supplierTypeCatalog } from './services/distribution-catalogs';
export { customers, customerTypes, suppliers, supplierTypes } from './models';

export default defineModule({
  name: 'distribution',
  // Farm-scoped: /api/farms/:farm/distribution…
  basePath: 'farms',
  router,
  setup() {
    // A deleted farm's suppliers and customers are marked deleted with it (rows are kept).
    farmExtensions.onDeleting(async (farm) => {
      const deleted = softDeleted();
      await db.transaction(async (tx) => {
        for (const table of [suppliers, customers, supplierTypes, customerTypes]) {
          await tx.update(table).set(deleted).where(and(eq(table.tenantId, farm.id), notDeleted(table)));
        }
      });
    });
  },
});
