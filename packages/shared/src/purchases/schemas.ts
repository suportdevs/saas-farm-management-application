import { z } from 'zod';
import { ANIMAL_SEXES, ANIMAL_TYPES } from '../herd/catalog';
import { choice, decimal, optional, optionalDate, optionalRef, required, requiredDate } from '../products/fields';
import { PURCHASE_MAX_ITEMS, PURCHASE_SOURCE_TYPES } from './constants';

/** A money amount: empty → 0. */
const money = decimal(9_999_999_999).transform((v) => v ?? 0);

/**
 * One animal bought. Saving the purchase adds the animal to the herd register
 * (or updates it, for a line that already has a `key`).
 */
export const purchaseItemSchema = z.object({
  /** Set on lines saved before (edit); empty for new lines. */
  key: optionalRef,
  tag: required('Ear tag', 50),
  name: optional(100),
  sex: choice(ANIMAL_SEXES, 'Sex', { required: true }),
  type: choice(ANIMAL_TYPES, 'Type'),
  breed: optional(100),
  price: decimal(9_999_999_999, 'Price'),
  entryWeightKg: decimal(5_000),
});

export const purchaseSchema = z.object({
  number: required('Purchase no.', 30),
  purchaseDate: requiredDate('Purchase date'),
  sourceType: choice(PURCHASE_SOURCE_TYPES, 'Source', { required: true }),
  haatName: optional(100),
  supplierKey: optionalRef,
  brokerKey: optionalRef,
  batchKey: optionalRef,
  transportCost: money,
  brokerFee: money,
  tollCost: money,
  otherCost: money,
  notes: optional(2000),
  items: z.array(purchaseItemSchema).min(1, 'Add at least one animal').max(PURCHASE_MAX_ITEMS, `At most ${PURCHASE_MAX_ITEMS} animals per purchase`),
});

export type PurchaseInput = z.infer<typeof purchaseSchema>;
export type PurchaseItemInput = z.infer<typeof purchaseItemSchema>;

/** GET /purchases — search, filters and paging. */
export const purchaseListSchema = z.object({
  q: z.string().trim().max(100).optional(),
  source_type: z.enum(PURCHASE_SOURCE_TYPES.map((s) => s.value) as [string, ...string[]]).optional(),
  from: optionalDate.optional(),
  to: optionalDate.optional(),
  /** Batch, supplier and broker keys. */
  batch: z.uuid().optional(),
  supplier: z.uuid().optional(),
  broker: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  // Up to 1,000 so Download gets every matching purchase.
  pageSize: z.coerce.number().int().min(1).max(1000).default(25),
});

export type PurchaseListQuery = z.infer<typeof purchaseListSchema>;

/** Purchase items list: the purchase filters plus the animal's type and the animal (key). */
export const purchaseItemListSchema = purchaseListSchema.extend({
  type: z.enum(ANIMAL_TYPES.map((t) => t.value) as [string, ...string[]]).optional(),
  animal: z.uuid().optional(),
});

export type PurchaseItemListQuery = z.infer<typeof purchaseItemListSchema>;
