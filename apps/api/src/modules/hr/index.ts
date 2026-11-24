import { and, eq } from 'drizzle-orm';
import { db, defineModule, notDeleted, softDeleted } from '../../core';
import { farmExtensions } from '../farms';
import { designations, employees } from './models';
import { router } from './routes/hr.routes';

/**
 * HR — designations and employees. Both are catalogs on the shared engine from
 * the products module (definitions in services/hr-catalogs.ts, columns and
 * choices in the shared hr/catalog.ts).
 *
 * Public API for other modules (import from '../hr' only):
 */
export { designationCatalog, employeeCatalog } from './services/hr-catalogs';
export { designations, employees } from './models';

export default defineModule({
  name: 'hr',
  // Farm-scoped: /api/farms/:farm/hr…
  basePath: 'farms',
  router,
  setup() {
    // A deleted farm's HR records are marked deleted with it (rows are kept).
    farmExtensions.onDeleting(async (farm) => {
      const deleted = softDeleted();
      await db.transaction(async (tx) => {
        for (const table of [employees, designations]) {
          await tx.update(table).set(deleted).where(and(eq(table.tenantId, farm.id), notDeleted(table)));
        }
      });
    });
  },
});
