import { pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { base, audit, activeUnique } from './columns';

export const units = pgTable(
  'units',
  {
    ...base(),
    name: varchar('name', { length: 100 }).notNull(),
    shortName: varchar('short_name', { length: 20 }).notNull(),
    description: text('description'),
    ...audit(),
  },
  (t) => [
    activeUnique('units_name_uq', t.tenantId, t.name),
    activeUnique('units_short_name_uq', t.tenantId, t.shortName),
  ],
);
