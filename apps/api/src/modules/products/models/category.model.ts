import { pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { base, audit, activeUnique } from './columns';

export const categories = pgTable(
  'categories',
  {
    ...base(),
    name: varchar('name', { length: 100 }).notNull(),
    code: varchar('code', { length: 30 }),
    description: text('description'),
    ...audit(),
  },
  (t) => [
    activeUnique('categories_name_uq', t.tenantId, t.name),
    activeUnique('categories_code_uq', t.tenantId, t.code),
  ],
);
