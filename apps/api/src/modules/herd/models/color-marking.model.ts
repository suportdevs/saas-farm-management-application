import { pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { activeUnique, audit, base } from '../../products/models/columns';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

/** Coat colors and markings a farm uses to describe animals. */
export const colorMarkings = pgTable(
  'color_markings',
  {
    ...base(),
    /** Stored as `color_name`; called `name` in code so the catalog engine can show and sort it. */
    name: varchar('color_name', { length: 50 }).notNull(),
    description: text('description'),
    ...audit(),
  },
  (t) => [activeUnique('color_markings_color_name_uq', t.tenantId, t.name)],
);
