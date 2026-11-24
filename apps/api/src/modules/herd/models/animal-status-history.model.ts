import { date, index, integer, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { audit, base } from '../../products/models/columns';
import { animals } from './animal.model';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

/**
 * One change of an animal's herd status (in_herd · sold · dead, HERD_STATUSES).
 * The latest change of each animal is copied to `animals.herd_status`.
 * Who changed it is `created_by` (audit column).
 */
export const animalStatusHistory = pgTable(
  'animal_status_history',
  {
    ...base(),
    animalId: integer('animal_id')
      .notNull()
      .references(() => animals.id),
    /** Empty = the animal's status when the change was saved. */
    previousStatus: varchar('previous_status', { length: 20 }),
    newStatus: varchar('new_status', { length: 20 }).notNull(),
    changeDate: date('change_date', { mode: 'string' }).notNull().defaultNow(),
    reason: text('reason'),
    ...audit(),
  },
  (t) => [index('animal_status_history_animal_idx').on(t.animalId, t.changeDate), index('animal_status_history_tenant_date_idx').on(t.tenantId, t.changeDate)],
);
