import { pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { activeUnique, audit, base } from '../../products/models/columns';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

/** Kinds of pens a farm uses: Feedlot, Quarantine, Hospital, Sorting… */
export const penTypes = pgTable(
  'pen_types',
  {
    ...base(),
    /** Stored as `type_name`; called `name` in code so the catalog engine can show and sort it. */
    name: varchar('type_name', { length: 100 }).notNull(),
    description: text('description'),
    ...audit(),
  },
  (t) => [activeUnique('pen_types_type_name_uq', t.tenantId, t.name)],
);
