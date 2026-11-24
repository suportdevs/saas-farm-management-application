import { index, integer, numeric, pgTable } from 'drizzle-orm/pg-core';
import { animals } from '../../herd/models/animal.model';
import { audit, base } from '../../products/models/columns';
import { purchases } from './purchase.model';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

const money = (name: string) => numeric(name, { precision: 12, scale: 2, mode: 'number' }).notNull();

/** One animal bought. Saving the purchase adds the animal to the herd and links it here. */
export const purchaseItems = pgTable(
  'purchase_items',
  {
    ...base(),
    purchaseId: integer('purchase_id')
      .notNull()
      .references(() => purchases.id),
    /** The animal this line added to the herd register. */
    animalId: integer('animal_id').references(() => animals.id),
    /** Animal price. */
    price: money('price'),
    /** This animal's share of transport / broker / toll / other (split by price share). */
    allocatedSharedCost: money('allocated_shared_cost').default(0),
    /** price + allocated_shared_cost: the animal's opening cost. */
    landedCost: money('landed_cost'),
    entryWeightKg: numeric('entry_weight_kg', { precision: 8, scale: 2, mode: 'number' }),
    ...audit(),
  },
  (t) => [index('purchase_items_purchase_idx').on(t.purchaseId), index('purchase_items_animal_idx').on(t.animalId)],
);
