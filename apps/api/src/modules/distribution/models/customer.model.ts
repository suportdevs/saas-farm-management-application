import { index, integer, jsonb, pgTable } from 'drizzle-orm/pg-core';
import type { WeightRange } from '@kit/shared';
import { activeUnique, audit, base } from '../../products/models/columns';
import { customerTypes } from './customer-type.model';
import { partyColumns } from './party-columns';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

/** Who the farm sells to. */
export const customers = pgTable(
  'customers',
  {
    ...base(),
    ...partyColumns(),
    typeId: integer('type_id').references(() => customerTypes.id),
    /** Breed names, e.g. ["Brahman", "Sahiwal"]. */
    preferredBreeds: jsonb('preferred_breeds').$type<string[]>(),
    /** { min, max, unit: 'kg' } */
    preferredWeightRange: jsonb('preferred_weight_range').$type<WeightRange>(),
    ...audit(),
  },
  (t) => [activeUnique('customers_code_uq', t.tenantId, t.code), index('customers_type_idx').on(t.typeId)],
);
