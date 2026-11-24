import { date, index, integer, numeric, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { audit, base } from '../../products/models/columns';
import { animals } from './animal.model';
import { batches } from './batch.model';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

/**
 * One weighing of one animal (was `weights`). Previous weight, gain, days since
 * the last weighing and ADG are worked out by the API after every change; the
 * latest weighing is copied to `animals.weight`. Who recorded it is `created_by`.
 */
export const weightRecords = pgTable(
  'weight_records',
  {
    ...base(),
    animalId: integer('animal_id')
      .notNull()
      .references(() => animals.id),
    /** Empty when saved = the animal's batch. */
    batchId: integer('batch_id').references(() => batches.id),
    weighDate: date('weigh_date', { mode: 'string' }).notNull(),
    weight: numeric('weight', { precision: 8, scale: 2, mode: 'number' }).notNull(),
    /** kg · lb */
    weightUnit: varchar('weight_unit', { length: 10 }).default('kg'),
    // Calculated from the animal's previous weighing.
    previousWeight: numeric('previous_weight', { precision: 8, scale: 2, mode: 'number' }),
    weightGain: numeric('weight_gain', { precision: 8, scale: 2, mode: 'number' }),
    daysSinceLast: integer('days_since_last'),
    /** Average daily gain since the previous weighing. */
    adg: numeric('adg', { precision: 6, scale: 3, mode: 'number' }),
    /** arrival · routine · pre_sale · post_treatment · program_check (WEIGH_TYPES). */
    weighType: varchar('weigh_type', { length: 50 }).notNull(),
    bodyConditionScore: numeric('body_condition_score', { precision: 3, scale: 1, mode: 'number' }),
    hipHeight: numeric('hip_height', { precision: 6, scale: 2, mode: 'number' }),
    scaleId: varchar('scale_id', { length: 50 }),
    /** digital_scale · tape_measure · visual_estimate (WEIGH_METHODS). */
    weighMethod: varchar('weigh_method', { length: 50 }),
    notes: text('notes'),
    ...audit(),
  },
  (t) => [
    index('weight_records_animal_idx').on(t.animalId, t.weighDate),
    index('weight_records_tenant_date_idx').on(t.tenantId, t.weighDate),
    index('weight_records_batch_idx').on(t.batchId),
  ],
);
