import { date, index, integer, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { activeUnique, audit, base, status } from '../../products/models/columns';
import { pens } from './pen.model';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

/** Groups of animals managed together (this year's calves, the dry cows…). */
export const batches = pgTable(
  'batches',
  {
    ...base(),
    name: varchar('name', { length: 100 }).notNull(),
    code: varchar('code', { length: 30 }),
    /** calves · heifers · milking · dry · breeding · fattening · other (BATCH_PURPOSES). */
    purpose: varchar('purpose', { length: 20 }),
    penId: integer('pen_id').references(() => pens.id),
    startDate: date('start_date', { mode: 'string' }),
    endDate: date('end_date', { mode: 'string' }),
    status: status(),
    description: text('description'),
    ...audit(),
  },
  (t) => [activeUnique('batches_name_uq', t.tenantId, t.name), activeUnique('batches_code_uq', t.tenantId, t.code), index('batches_pen_idx').on(t.penId)],
);
