import { and, count, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import {
  FINISH_RECEIVE_STATUS,
  linePrice,
  type FinishReceiveDetail,
  type FinishReceiveInput,
  type FinishReceiveListQuery,
  type FinishReceiveRow,
  type FinishReceiveStatus,
} from '@kit/shared';
import { conflict, db, escapeLike, notDeleted, notFound, validationError } from '../../../core';
import { warehouses } from '../../herd';
import { employees } from '../../hr';
import { products, productSizes, units } from '../../products';
import { finishReceiveItems, finishReceives } from '../models';

/*
 * Finish receives: a header (order no., warehouse, who received it) and one
 * line per product size. Pending receives can be changed or deleted; Process
 * marks the receive and its lines processed, after which they are locked.
 */

/** Live totals of a receive's lines (not deleted). */
const lines = (expr: SQL) => sql<number>`(select ${expr} from ${finishReceiveItems} i where i.finish_receive_id = ${finishReceives.id} and i.deleted_at is null)`;

function selectRows() {
  return db
    .select({
      id: finishReceives.id,
      key: finishReceives.key,
      orderNo: finishReceives.orderNo,
      receiveDate: finishReceives.receiveDate,
      warehouseKey: warehouses.key,
      warehouseName: warehouses.name,
      receivedByKey: employees.key,
      receivedByName: employees.name,
      note: finishReceives.note,
      status: finishReceives.status,
      items: lines(sql`count(*)::int`),
      totalQuantity: lines(sql`coalesce(sum(i.quantity), 0)::float8`),
      totalPrice: lines(sql`coalesce(sum(i.price), 0)::float8`),
    })
    .from(finishReceives)
    .innerJoin(warehouses, eq(warehouses.id, finishReceives.warehouseId))
    .leftJoin(employees, eq(employees.id, finishReceives.receiveBy));
}

type SelectedRow = Awaited<ReturnType<ReturnType<typeof selectRows>['execute']>>[number];
const toRow = ({ id: _id, ...row }: SelectedRow) => row as FinishReceiveRow;

const ofTenant = (tenantId: string, extra?: SQL) => and(eq(finishReceives.tenantId, tenantId), notDeleted(finishReceives), extra);

// ─── Reads ───────────────────────────────────────────────────────

export async function listFinishReceives(tenantId: string, { q, status, warehouse, from, to, page, pageSize }: FinishReceiveListQuery) {
  const like = q ? `%${escapeLike(q)}%` : undefined;
  const where = ofTenant(
    tenantId,
    and(
      like ? or(ilike(finishReceives.orderNo, like), ilike(finishReceives.note, like)) : undefined,
      status !== undefined ? eq(finishReceives.status, Number(status)) : undefined,
      warehouse ? eq(warehouses.key, warehouse) : undefined,
      from ? gte(finishReceives.receiveDate, from) : undefined,
      to ? lte(finishReceives.receiveDate, to) : undefined,
    ),
  );
  const [rows, [total]] = await Promise.all([
    selectRows()
      .where(where)
      .orderBy(desc(finishReceives.receiveDate), desc(finishReceives.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ value: count() })
      .from(finishReceives)
      .innerJoin(warehouses, eq(warehouses.id, finishReceives.warehouseId))
      .where(where),
  ]);
  return { rows: rows.map(toRow), pagination: { page, pageSize, total: total?.value ?? 0 } };
}

export async function getFinishReceive(tenantId: string, key: string): Promise<FinishReceiveDetail> {
  const [row] = await selectRows().where(ofTenant(tenantId, eq(finishReceives.key, key)));
  if (!row) throw notFound('Finish receive not found');
  const items = await db
    .select({
      key: finishReceiveItems.key,
      productSizeKey: productSizes.key,
      productSizeName: productSizes.name,
      productName: products.name,
      unitName: units.name,
      quantity: finishReceiveItems.quantity,
      rate: finishReceiveItems.rate,
      price: finishReceiveItems.price,
      status: finishReceiveItems.status,
    })
    .from(finishReceiveItems)
    .innerJoin(productSizes, eq(productSizes.id, finishReceiveItems.productSizeId))
    .leftJoin(products, eq(products.id, productSizes.productId))
    .leftJoin(units, eq(units.id, productSizes.unitId))
    .where(and(eq(finishReceiveItems.finishReceiveId, row.id), notDeleted(finishReceiveItems)))
    .orderBy(finishReceiveItems.id);
  const { items: _count, ...header } = toRow(row);
  return { ...header, lines: items as FinishReceiveDetail['lines'] };
}

// ─── Checks ──────────────────────────────────────────────────────

type KeyedTable = typeof warehouses | typeof employees | typeof productSizes;

/** Internal ids of a farm's rows by key; unknown keys become field errors. */
async function idsOf(table: KeyedTable, tenantId: string, keys: string[]) {
  if (!keys.length) return new Map<string, number>();
  const rows = await db
    .select({ id: table.id, key: table.key })
    .from(table)
    .where(and(eq(table.tenantId, tenantId), inArray(table.key, keys), notDeleted(table)));
  return new Map(rows.map((r) => [r.key, r.id]));
}

async function resolve(tenantId: string, input: FinishReceiveInput) {
  const [warehouse, employee, sizes] = await Promise.all([
    idsOf(warehouses, tenantId, [input.warehouseKey]),
    idsOf(employees, tenantId, input.receivedByKey ? [input.receivedByKey] : []),
    idsOf(productSizes, tenantId, [...new Set(input.items.map((i) => i.productSizeKey))]),
  ]);
  const errors: Record<string, string[]> = {};
  if (!warehouse.get(input.warehouseKey)) errors.warehouseKey = ['Choose a warehouse'];
  if (input.receivedByKey && !employee.get(input.receivedByKey)) errors.receivedByKey = ['Choose an employee'];
  input.items.forEach((item, i) => {
    if (!sizes.get(item.productSizeKey)) errors[`items.${i}.productSizeKey`] = ['Choose a product'];
  });
  if (Object.keys(errors).length) throw validationError(errors);
  return {
    warehouseId: warehouse.get(input.warehouseKey)!,
    receiveBy: input.receivedByKey ? employee.get(input.receivedByKey)! : null,
    sizeId: (key: string) => sizes.get(key)!,
  };
}

/** Order no. is unique per farm. */
async function assertOrderNoFree(tenantId: string, orderNo: string, exceptId?: number) {
  const [taken] = await db
    .select({ id: finishReceives.id })
    .from(finishReceives)
    .where(ofTenant(tenantId, and(sql`lower(${finishReceives.orderNo}) = lower(${orderNo})`, exceptId ? sql`${finishReceives.id} <> ${exceptId}` : undefined)));
  if (taken) throw validationError({ orderNo: [`Order no. "${orderNo}" is already used`] });
}

/** A pending receive by key (id); processed ones can't change (409). */
async function findPending(tenantId: string, key: string) {
  const [row] = await db
    .select({ id: finishReceives.id, status: finishReceives.status })
    .from(finishReceives)
    .where(ofTenant(tenantId, eq(finishReceives.key, key)));
  if (!row) throw notFound('Finish receive not found');
  if (row.status === FINISH_RECEIVE_STATUS.processed) throw conflict('This receive is processed and can no longer be changed', 'ALREADY_PROCESSED');
  return row.id;
}

// ─── Writes ──────────────────────────────────────────────────────

const lineValues = (item: FinishReceiveInput['items'][number], productSizeId: number) => ({
  productSizeId,
  quantity: item.quantity!,
  rate: item.rate!,
  price: linePrice(item.quantity!, item.rate!),
});

export async function createFinishReceive(tenantId: string, userId: string, input: FinishReceiveInput) {
  const refs = await resolve(tenantId, input);
  await assertOrderNoFree(tenantId, input.orderNo);
  const key = await db.transaction(async (tx) => {
    const [receive] = await tx
      .insert(finishReceives)
      .values({ tenantId, orderNo: input.orderNo, receiveDate: input.receiveDate, warehouseId: refs.warehouseId, receiveBy: refs.receiveBy, note: input.note, createdBy: userId, updatedBy: userId })
      .returning({ id: finishReceives.id, key: finishReceives.key });
    await tx.insert(finishReceiveItems).values(
      input.items.map((item) => ({ tenantId, finishReceiveId: receive!.id, ...lineValues(item, refs.sizeId(item.productSizeKey)), createdBy: userId, updatedBy: userId })),
    );
    return receive!.key;
  });
  return getFinishReceive(tenantId, key);
}

/** Lines with a `key` are updated, new ones added, saved lines left out are deleted. Pending only. */
export async function updateFinishReceive(tenantId: string, userId: string, key: string, input: FinishReceiveInput) {
  const id = await findPending(tenantId, key);
  const saved = await db
    .select({ id: finishReceiveItems.id, key: finishReceiveItems.key })
    .from(finishReceiveItems)
    .where(and(eq(finishReceiveItems.finishReceiveId, id), notDeleted(finishReceiveItems)));
  const byKey = new Map(saved.map((s) => [s.key, s.id]));
  const unknown: Record<string, string[]> = {};
  input.items.forEach((item, i) => {
    if (item.key && !byKey.has(item.key)) unknown[`items.${i}.key`] = ['This line no longer exists'];
  });
  if (Object.keys(unknown).length) throw validationError(unknown);

  const refs = await resolve(tenantId, input);
  await assertOrderNoFree(tenantId, input.orderNo, id);
  const kept = new Set(input.items.map((i) => i.key).filter(Boolean));
  const removed = saved.filter((s) => !kept.has(s.key)).map((s) => s.id);

  await db.transaction(async (tx) => {
    await tx
      .update(finishReceives)
      .set({ orderNo: input.orderNo, receiveDate: input.receiveDate, warehouseId: refs.warehouseId, receiveBy: refs.receiveBy, note: input.note, updatedBy: userId })
      .where(eq(finishReceives.id, id));
    for (const item of input.items) {
      const values = lineValues(item, refs.sizeId(item.productSizeKey));
      const lineId = item.key ? byKey.get(item.key) : undefined;
      if (lineId) await tx.update(finishReceiveItems).set({ ...values, updatedBy: userId }).where(eq(finishReceiveItems.id, lineId));
      else await tx.insert(finishReceiveItems).values({ tenantId, finishReceiveId: id, ...values, createdBy: userId, updatedBy: userId });
    }
    if (removed.length) await tx.update(finishReceiveItems).set({ deletedAt: new Date(), deletedBy: userId }).where(inArray(finishReceiveItems.id, removed));
  });
  return getFinishReceive(tenantId, key);
}

/** Marks the receive and all its lines processed (status 1). They are locked afterwards. */
export async function processFinishReceive(tenantId: string, userId: string, key: string) {
  const id = await findPending(tenantId, key);
  const processed: FinishReceiveStatus = FINISH_RECEIVE_STATUS.processed;
  await db.transaction(async (tx) => {
    await tx.update(finishReceives).set({ status: processed, updatedBy: userId }).where(eq(finishReceives.id, id));
    await tx
      .update(finishReceiveItems)
      .set({ status: processed, updatedBy: userId })
      .where(and(eq(finishReceiveItems.finishReceiveId, id), notDeleted(finishReceiveItems)));
  });
  return getFinishReceive(tenantId, key);
}

/** Deletes a pending receive and its lines (soft delete). */
export async function deleteFinishReceive(tenantId: string, userId: string, key: string) {
  const id = await findPending(tenantId, key);
  const deleted = { deletedAt: new Date(), deletedBy: userId };
  await db.transaction(async (tx) => {
    await tx.update(finishReceiveItems).set(deleted).where(and(eq(finishReceiveItems.finishReceiveId, id), notDeleted(finishReceiveItems)));
    await tx.update(finishReceives).set(deleted).where(eq(finishReceives.id, id));
  });
}
