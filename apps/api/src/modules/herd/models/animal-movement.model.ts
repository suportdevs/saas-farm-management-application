import { date, index, integer, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { audit, base } from '../../products/models/columns';
import { animals } from './animal.model';
import { pens } from './pen.model';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

/**
 * An animal moved from one pen to another. The latest movement of each animal
 * is copied to `animals.pen_id`. Who moved it is `created_by` (audit column).
 */
export const animalMovements = pgTable(
  'animal_movements',
  {
    ...base(),
    animalId: integer('animal_id')
      .notNull()
      .references(() => animals.id),
    /** Empty = the animal's pen when the movement was saved. */
    fromPenId: integer('from_pen_id').references(() => pens.id),
    toPenId: integer('to_pen_id')
      .notNull()
      .references(() => pens.id),
    movementDate: date('movement_date', { mode: 'string' }).notNull().defaultNow(),
    /** routine · treatment · sorting · sale_prep · other (MOVEMENT_REASONS). */
    reason: varchar('reason', { length: 255 }),
    notes: text('notes'),
    ...audit(),
  },
  (t) => [
    index('animal_movements_animal_idx').on(t.animalId, t.movementDate),
    index('animal_movements_tenant_date_idx').on(t.tenantId, t.movementDate),
    index('animal_movements_to_pen_idx').on(t.toPenId),
    index('animal_movements_from_pen_idx').on(t.fromPenId),
  ],
);
