import { index, integer, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { activeUnique, audit, base, status } from '../../products/models/columns';
import { penTypes } from './pen-type.model';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

/** Barns, stalls and paddocks where animals are kept. */
export const pens = pgTable(
  'pens',
  {
    ...base(),
    name: varchar('name', { length: 100 }).notNull(),
    code: varchar('code', { length: 30 }),
    penTypeId: integer('pen_type_id').references(() => penTypes.id),
    capacity: integer('capacity'),
    status: status(),
    description: text('description'),
    ...audit(),
  },
  (t) => [activeUnique('pens_name_uq', t.tenantId, t.name), activeUnique('pens_code_uq', t.tenantId, t.code), index('pens_pen_type_idx').on(t.penTypeId)],
);
