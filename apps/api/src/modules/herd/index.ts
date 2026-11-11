import { and, eq } from 'drizzle-orm';
import { db, defineModule, notDeleted, softDeleted } from '../../core';
import { farmExtensions, registerUsageCounter } from '../farms';
import { animals, pens } from './models';
import { router } from './routes/herd.routes';
import { countAnimals } from './services/herd-catalogs';

/**
 * Herd — the animal register and pens. Both are catalogs on the shared engine
 * from the products module (definitions in services/herd-catalogs.ts, columns
 * and choices in the shared herd/catalog.ts).
 *
 * Public API for other modules (import from '../herd' only):
 */
export { animalCatalog, countAnimals, penCatalog } from './services/herd-catalogs';
export { animals, pens } from './models';

export default defineModule({
  name: 'herd',
  // Farm-scoped: /api/farms/:farm/herd…
  basePath: 'farms',
  router,
  setup() {
    // Animals in the herd count toward the plan limit and show on the billing page.
    registerUsageCounter('animals', countAnimals);
    // A deleted farm's herd is marked deleted with it (rows are kept).
    farmExtensions.onDeleting(async (farm) => {
      const deleted = softDeleted();
      await db.transaction(async (tx) => {
        for (const table of [animals, pens]) {
          await tx.update(table).set(deleted).where(and(eq(table.tenantId, farm.id), notDeleted(table)));
        }
      });
    });
  },
});
