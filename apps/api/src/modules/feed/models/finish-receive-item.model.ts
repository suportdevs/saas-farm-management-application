import { index, integer, numeric, pgTable, smallint } from 'drizzle-orm/pg-core';
import { audit, base } from '../../products/models/columns';
import { productSizes } from '../../products/models/product-size.model';
import { finishReceives } from './finish-receive.model';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

/** One product size received: quantity × rate = price. status follows the receive (0 = Pending, 1 = Processed). */
export const finishReceiveItems = pgTable(
  'finish_receive_items',
  {
    ...base(),
    finishReceiveId: integer('finish_receive_id')
      .notNull()
      .references(() => finishReceives.id),
    productSizeId: integer('product_size_id')
      .notNull()
      .references(() => productSizes.id),
    quantity: numeric('quantity', { precision: 12, scale: 3, mode: 'number' }).notNull(),
    rate: numeric('rate', { precision: 12, scale: 2, mode: 'number' }).notNull(),
    /** quantity × rate */
    price: numeric('price', { precision: 14, scale: 2, mode: 'number' }).notNull(),
    status: smallint('status').notNull().default(0),
    ...audit(),
  },
  (t) => [index('finish_receive_items_receive_idx').on(t.finishReceiveId), index('finish_receive_items_product_size_idx').on(t.productSizeId)],
);
