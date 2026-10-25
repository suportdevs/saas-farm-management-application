import { pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { base, audit, activeUnique } from './columns';

export const colors = pgTable(
  'colors',
  {
    ...base(),
    name: varchar('name', { length: 100 }).notNull(),
    code: varchar('code', { length: 30 }),
    description: text('description'),
    ...audit(),
  },
  (t) => [activeUnique('colors_name_uq', t.tenantId, t.name)],
);
