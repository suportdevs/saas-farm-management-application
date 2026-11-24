import { and, eq } from 'drizzle-orm';
import { db, defineModule, notDeleted, softDeleted } from '../../core';
import { farmExtensions, registerUsageCounter } from '../farms';
import { animalMovements, animals, animalStatusHistory, batches, breeds, colorMarkings, pens, penTypes, weightRecords, weightTargets } from './models';
import { router } from './routes/herd.routes';
import { countAnimals } from './services/herd-catalogs';

/**
 * Herd — the animal register, pens, pen types, batches, weight records, weight targets, movements, status history, breeds and color markings. All are catalogs on the shared engine
 * from the products module (definitions in services/herd-catalogs.ts, columns
 * and choices in the shared herd/catalog.ts).
 *
 * Public API for other modules (import from '../herd' only):
 */
export {
  animalCatalog,
  batchCatalog,
  breedCatalog,
  colorMarkingCatalog,
  countAnimals,
  movementCatalog,
  penCatalog,
  penTypeCatalog,
  statusHistoryCatalog,
  syncAnimalPens,
  syncAnimalStatuses,
  syncLatestWeights,
  syncWeights,
  syncWeightTargets,
  weightCatalog,
  weightTargetCatalog,
} from './services/herd-catalogs';
export { animalMovements, animals, animalStatusHistory, batches, breeds, colorMarkings, pens, penTypes, weightRecords, weightTargets } from './models';

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
        // Built-in breeds have no tenant, so only the farm's own rows match.
        for (const table of [weightRecords, weightTargets, animalMovements, animalStatusHistory, animals, batches, pens, penTypes, breeds, colorMarkings]) {
          await tx.update(table).set(deleted).where(and(eq(table.tenantId, farm.id), notDeleted(table)));
        }
      });
    });
  },
});
