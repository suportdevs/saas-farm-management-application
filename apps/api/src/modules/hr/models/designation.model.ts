import { pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { activeUnique, audit, base } from '../../products/models/columns';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

/** Job titles on the farm (Farm manager, Herdsman, Milker…). Name is unique per farm. */
export const designations = pgTable(
  'designations',
  {
    ...base(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    ...audit(),
  },
  (t) => [activeUnique('designations_name_uq', t.tenantId, t.name)],
);
