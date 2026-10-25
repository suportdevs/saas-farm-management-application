import { numeric, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { base, audit, activeUnique } from './columns';

export const sizes = pgTable(
  'sizes',
  {
    ...base(),
    name: varchar('name', { length: 100 }).notNull(),
    shortName: varchar('short_name', { length: 20 }),
    weight: numeric('weight', { precision: 12, scale: 3, mode: 'number' }).notNull(),
    description: text('description'),
    ...audit(),
  },
  (t) => [
    activeUnique('sizes_name_uq', t.tenantId, t.name),
    activeUnique('sizes_short_name_uq', t.tenantId, t.shortName),
  ],
);
