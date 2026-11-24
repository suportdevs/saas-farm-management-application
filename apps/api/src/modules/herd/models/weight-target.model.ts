import { date, index, integer, numeric, pgTable, varchar } from 'drizzle-orm/pg-core';
import { audit, base } from '../../products/models/columns';
import { animals } from './animal.model';
import { batches } from './batch.model';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

/**
 * A target weight for one animal or a whole batch (one of the two is set).
 * `current_progress` and `status` are worked out by the API from the latest weights.
 */
export const weightTargets = pgTable(
  'weight_targets',
  {
    ...base(),
    animalId: integer('animal_id').references(() => animals.id),
    batchId: integer('batch_id').references(() => batches.id),
    targetWeight: numeric('target_weight', { precision: 8, scale: 2, mode: 'number' }).notNull(),
    targetDate: date('target_date', { mode: 'string' }).notNull(),
    targetAdg: numeric('target_adg', { precision: 6, scale: 3, mode: 'number' }),
    /** Latest weight ÷ target, in % (a batch: the average weight of its animals in the herd). */
    currentProgress: numeric('current_progress', { precision: 5, scale: 2, mode: 'number' }),
    /** active · achieved · missed (WEIGHT_TARGET_STATUSES). */
    status: varchar('status', { length: 20 }).default('active'),
    ...audit(),
  },
  (t) => [index('weight_targets_animal_idx').on(t.animalId), index('weight_targets_batch_idx').on(t.batchId), index('weight_targets_tenant_date_idx').on(t.tenantId, t.targetDate)],
);
