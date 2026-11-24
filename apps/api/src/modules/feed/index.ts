import { and, eq } from 'drizzle-orm';
import { db, defineModule, notDeleted, softDeleted } from '../../core';
import { farmExtensions } from '../farms';
import { warehouseCatalog } from '../herd';
import { employeeCatalog } from '../hr';
import { productSizeCatalog } from '../products';
import { finishReceiveItems, finishReceives } from './models';
import { router } from './routes/feed.routes';

/**
 * Feed — finish receives: finished feed / goods received into a warehouse
 * against an order, one line per product size (quantity × rate). Pending
 * receives can change; Process locks them.
 *
 * Public API for other modules (import from '../feed' only):
 */
export { getFinishReceive, listFinishReceives } from './services/finish-receive.service';
export { finishReceiveItems, finishReceives } from './models';

// Those modules can't import this one, so it tells them: a warehouse, employee or product size used by a receive can't be deleted.
warehouseCatalog.addUsedBy({ table: finishReceives, column: finishReceives.warehouseId, label: 'finish receive' });
employeeCatalog.addUsedBy({ table: finishReceives, column: finishReceives.receiveBy, label: 'finish receive' });
productSizeCatalog.addUsedBy({ table: finishReceiveItems, column: finishReceiveItems.productSizeId, label: 'finish receive line' });

export default defineModule({
  name: 'feed',
  // Farm-scoped: /api/farms/:farm/feed…
  basePath: 'farms',
  router,
  setup() {
    // A deleted farm's receives are marked deleted with it (rows are kept).
    farmExtensions.onDeleting(async (farm) => {
      const deleted = softDeleted();
      await db.transaction(async (tx) => {
        for (const table of [finishReceiveItems, finishReceives]) {
          await tx.update(table).set(deleted).where(and(eq(table.tenantId, farm.id), notDeleted(table)));
        }
      });
    });
  },
});
