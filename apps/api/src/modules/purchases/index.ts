import { and, eq } from 'drizzle-orm';
import { db, defineModule, notDeleted, softDeleted } from '../../core';
import { supplierCatalog } from '../distribution';
import { farmExtensions } from '../farms';
import { batchCatalog } from '../herd';
import { purchaseItems, purchases } from './models';
import { router } from './routes/purchase.routes';

/**
 * Purchase — animal procurement: a purchase (one trip / invoice) and one line
 * per animal bought. Shared costs (transport, broker, toll, other) are split
 * over the lines by price share; each line adds its animal to the herd.
 *
 * Public API for other modules (import from '../purchases' only):
 */
export { getPurchase, listPurchases } from './services/purchase.service';
export { purchaseItems, purchases } from './models';

// Distribution and herd can't import this module, so it tells them: a supplier, broker or batch used by purchases can't be deleted.
supplierCatalog.addUsedBy({ table: purchases, column: purchases.supplierId, label: 'purchase' });
supplierCatalog.addUsedBy({ table: purchases, column: purchases.brokerId, label: 'purchase' });
batchCatalog.addUsedBy({ table: purchases, column: purchases.batchId, label: 'purchase' });

export default defineModule({
  name: 'purchases',
  // Farm-scoped: /api/farms/:farm/purchases…
  basePath: 'farms',
  router,
  setup() {
    // A deleted farm's purchases are marked deleted with it (rows are kept).
    farmExtensions.onDeleting(async (farm) => {
      const deleted = softDeleted();
      await db.transaction(async (tx) => {
        for (const table of [purchaseItems, purchases]) {
          await tx.update(table).set(deleted).where(and(eq(table.tenantId, farm.id), notDeleted(table)));
        }
      });
    });
  },
});
