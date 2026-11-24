import { z } from 'zod';
import { decimal, optional, optionalDate, optionalRef, ref, required, requiredDate } from '../products/fields';

/**
 * Finish receive: finished feed / goods received into a warehouse against an
 * order, one line per product size. Pending receives can be edited or
 * deleted; "Process" marks the receive and all its lines processed (locked).
 */

/** 0 = Pending, 1 = Processed (header and lines). */
export const FINISH_RECEIVE_STATUS = { pending: 0, processed: 1 } as const;
export type FinishReceiveStatus = (typeof FINISH_RECEIVE_STATUS)[keyof typeof FINISH_RECEIVE_STATUS];

export const FINISH_RECEIVE_STATUSES = [
  { value: '0', label: 'Pending' },
  { value: '1', label: 'Processed' },
] as const;

export const finishReceiveStatusLabel = (status: number) => (status === FINISH_RECEIVE_STATUS.processed ? 'Processed' : 'Pending');

/** Most lines one receive can have. */
export const FINISH_RECEIVE_MAX_ITEMS = 500;

/** quantity × rate, rounded to cents. */
export const linePrice = (quantity: number, rate: number) => Math.round(quantity * rate * 100) / 100;

export const finishReceiveItemSchema = z.object({
  /** Set on lines saved before (edit); empty for new lines. */
  key: optionalRef,
  productSizeKey: ref('Choose a product'),
  quantity: decimal(9_999_999, 'Quantity'),
  rate: decimal(9_999_999_999, 'Rate'),
});

export const finishReceiveSchema = z.object({
  orderNo: required('Order no.', 30),
  receiveDate: requiredDate('Receive date'),
  warehouseKey: ref('Choose a warehouse'),
  receivedByKey: optionalRef,
  note: optional(2000),
  items: z.array(finishReceiveItemSchema).min(1, 'Add at least one product').max(FINISH_RECEIVE_MAX_ITEMS, `At most ${FINISH_RECEIVE_MAX_ITEMS} lines per receive`),
});

export type FinishReceiveInput = z.infer<typeof finishReceiveSchema>;
export type FinishReceiveItemInput = z.infer<typeof finishReceiveItemSchema>;

/** GET /feed/finish-receives — search, filters and paging. */
export const finishReceiveListSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['0', '1']).optional(),
  warehouse: z.uuid().optional(),
  from: optionalDate.optional(),
  to: optionalDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  // Up to 1,000 so Download gets every matching receive.
  pageSize: z.coerce.number().int().min(1).max(1000).default(25),
});

export type FinishReceiveListQuery = z.infer<typeof finishReceiveListSchema>;

/** A receive in the list, with its totals. */
export interface FinishReceiveRow {
  key: string;
  orderNo: string;
  /** YYYY-MM-DD */
  receiveDate: string;
  warehouseKey: string;
  warehouseName: string;
  receivedByKey: string | null;
  receivedByName: string | null;
  note: string | null;
  status: FinishReceiveStatus;
  /** Number of lines. */
  items: number;
  totalQuantity: number;
  totalPrice: number;
}

export interface FinishReceiveItemRow {
  key: string;
  productSizeKey: string;
  /** "Dairy concentrate 25 kg". */
  productSizeName: string;
  productName: string | null;
  unitName: string | null;
  quantity: number;
  rate: number;
  /** quantity × rate */
  price: number;
  status: FinishReceiveStatus;
}

export interface FinishReceiveDetail extends Omit<FinishReceiveRow, 'items'> {
  lines: FinishReceiveItemRow[];
}
