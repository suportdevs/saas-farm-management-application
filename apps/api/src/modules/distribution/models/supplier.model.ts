import { index, integer, numeric, pgTable } from 'drizzle-orm/pg-core';
import { activeUnique, audit, base } from '../../products/models/columns';
import { partyColumns } from './party-columns';
import { supplierTypes } from './supplier-type.model';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

/** Who the farm buys from. */
export const suppliers = pgTable(
  'suppliers',
  {
    ...base(),
    ...partyColumns(),
    typeId: integer('type_id').references(() => supplierTypes.id),
    /** 0.00 – 5.00 */
    rating: numeric('rating', { precision: 3, scale: 2, mode: 'number' }),
    ...audit(),
  },
  (t) => [activeUnique('suppliers_code_uq', t.tenantId, t.code), index('suppliers_type_idx').on(t.typeId)],
);
