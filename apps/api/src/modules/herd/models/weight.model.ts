import { date, index, integer, numeric, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { audit, base } from '../../products/models/columns';
import { animals } from './animal.model';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

/** One weighing of one animal. The latest one is copied to `animals.weight`. */
export const weights = pgTable(
  'weights',
  {
    ...base(),
    animalId: integer('animal_id')
      .notNull()
      .references(() => animals.id),
    weighedOn: date('weighed_on', { mode: 'string' }).notNull(),
    weight: numeric('weight', { precision: 8, scale: 2, mode: 'number' }).notNull(),
    /** scale · tape · estimate (WEIGH_METHODS). */
    method: varchar('method', { length: 10 }),
    notes: text('notes'),
    ...audit(),
  },
  (t) => [index('weights_animal_idx').on(t.animalId, t.weighedOn), index('weights_tenant_date_idx').on(t.tenantId, t.weighedOn)],
);
