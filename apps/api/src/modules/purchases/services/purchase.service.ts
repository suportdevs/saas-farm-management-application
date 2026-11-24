import { and, count, desc, eq, gte, ilike, inArray, lte, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { sharedCostOf, splitSharedCost, type PurchaseDetail, type PurchaseInput, type PurchaseItemInput, type PurchaseListQuery, type PurchaseRow } from '@kit/shared';
import { db, escapeLike, notDeleted, notFound, validationError } from '../../../core';
import { suppliers } from '../../distribution';
import type { Tx } from '../../farms';
import { animalCatalog, animals, batches, countAnimals, syncWeights, weightRecords } from '../../herd';
import { assertWithinLimit } from '../../subscriptions';
import { purchaseItems, purchases } from '../models';

/*
 * Purchases: a header (one trip / invoice) and one line per animal bought.
 * Saving a purchase also keeps the herd in step: each line's animal is added
 * to (or updated in) the herd register, with an "arrival" weighing when an
 * entry weight is given.
 */

const supplier = alias(suppliers, 'supplier');
const broker = alias(suppliers, 'broker');

/** Live totals of a purchase's lines (not deleted). */
const lines = (expr: SQL) => sql<number>`(select ${expr} from ${purchaseItems} i where i.purchase_id = ${purchases.id} and i.deleted_at is null)`;

/** The list row: header, names of the references and the line totals. */
function selectRows() {
  return db
    .select({
      id: purchases.id,
      key: purchases.key,
      number: purchases.number,
      purchaseDate: purchases.purchaseDate,
      sourceType: purchases.sourceType,
      haatName: purchases.haatName,
      supplierKey: supplier.key,
      supplierName: supplier.name,
      brokerKey: broker.key,
      brokerName: broker.name,
      batchKey: batches.key,
      batchName: batches.number,
      transportCost: purchases.transportCost,
      brokerFee: purchases.brokerFee,
      tollCost: purchases.tollCost,
      otherCost: purchases.otherCost,
      notes: purchases.notes,
      animals: lines(sql`count(*)::int`),
      totalPrice: lines(sql`coalesce(sum(i.price), 0)::float8`),
    })
    .from(purchases)
    .leftJoin(supplier, eq(supplier.id, purchases.supplierId))
    .leftJoin(broker, eq(broker.id, purchases.brokerId))
    .leftJoin(batches, eq(batches.id, purchases.batchId));
}

type SelectedRow = Awaited<ReturnType<ReturnType<typeof selectRows>['execute']>>[number];

/** Adds the shared cost and landed total; drops the internal id. */
function toRow({ id: _id, ...row }: SelectedRow): PurchaseRow {
  const sharedCost = sharedCostOf(row);
  return { ...row, sharedCost, totalLanded: Math.round((row.totalPrice + sharedCost) * 100) / 100 } as PurchaseRow;
}

const ofTenant = (tenantId: string, extra?: SQL) => and(eq(purchases.tenantId, tenantId), notDeleted(purchases), extra);

// ─── Reads ───────────────────────────────────────────────────────

export async function listPurchases(tenantId: string, { q, source_type, from, to, page, pageSize }: PurchaseListQuery) {
  const like = q ? `%${escapeLike(q)}%` : undefined;
  const where = ofTenant(
    tenantId,
    and(
      like ? or(ilike(purchases.number, like), ilike(purchases.haatName, like)) : undefined,
      source_type ? eq(purchases.sourceType, source_type) : undefined,
      from ? gte(purchases.purchaseDate, from) : undefined,
      to ? lte(purchases.purchaseDate, to) : undefined,
    ),
  );
  const [rows, [total]] = await Promise.all([
    selectRows()
      .where(where)
      .orderBy(desc(purchases.purchaseDate), desc(purchases.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(purchases).where(where),
  ]);
  return { rows: rows.map(toRow), pagination: { page, pageSize, total: total?.value ?? 0 } };
}

export async function getPurchase(tenantId: string, key: string): Promise<PurchaseDetail> {
  const [row] = await selectRows().where(ofTenant(tenantId, eq(purchases.key, key)));
  if (!row) throw notFound('Purchase not found');
  const items = await db
    .select({
      key: purchaseItems.key,
      animalKey: animals.key,
      tag: animals.tag,
      name: animals.name,
      sex: animals.sex,
      type: animals.type,
      breed: animals.breed,
      price: purchaseItems.price,
      allocatedSharedCost: purchaseItems.allocatedSharedCost,
      landedCost: purchaseItems.landedCost,
      entryWeightKg: purchaseItems.entryWeightKg,
    })
    .from(purchaseItems)
    .leftJoin(animals, eq(animals.id, purchaseItems.animalId))
    .where(and(eq(purchaseItems.purchaseId, row.id), notDeleted(purchaseItems)))
    .orderBy(purchaseItems.id);
  return { ...toRow(row), items } as PurchaseDetail;
}

// ─── Checks ──────────────────────────────────────────────────────

/** Internal id of a farm's row by key, or a field error. */
async function idOf(table: typeof suppliers | typeof batches, tenantId: string, key: string | null, field: string, label: string) {
  if (!key) return null;
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.tenantId, tenantId), eq(table.key, key), notDeleted(table)));
  if (!row) throw validationError({ [field]: [`Choose ${label}`] });
  return row.id;
}

/** Purchase no. is unique per farm. */
async function assertNumberFree(tenantId: string, number: string, exceptId?: number) {
  const [taken] = await db
    .select({ id: purchases.id })
    .from(purchases)
    .where(ofTenant(tenantId, and(sql`lower(${purchases.number}) = lower(${number})`, exceptId ? sql`${purchases.id} <> ${exceptId}` : undefined)));
  if (taken) throw validationError({ number: [`Purchase no. "${number}" is already used`] });
}

/** Ear tags: unique within the purchase and among the farm's other animals (`ownAnimalIds` are this purchase's). */
async function assertTagsFree(tenantId: string, items: PurchaseItemInput[], ownAnimalIds: number[]) {
  const errors: Record<string, string[]> = {};
  const seen = new Map<string, number>();
  items.forEach((item, i) => {
    const tag = item.tag.toLowerCase();
    if (seen.has(tag)) errors[`items.${i}.tag`] = ['Ear tag is used twice in this purchase'];
    else seen.set(tag, i);
  });
  const taken = await db
    .select({ tag: animals.tag })
    .from(animals)
    .where(
      and(
        eq(animals.tenantId, tenantId),
        notDeleted(animals),
        inArray(sql`lower(${animals.tag})`, [...seen.keys()]),
        ownAnimalIds.length ? notInArray(animals.id, ownAnimalIds) : undefined,
      ),
    );
  for (const { tag } of taken) errors[`items.${seen.get(tag.toLowerCase())}.tag`] = [`Ear tag "${tag}" is already in the herd`];
  if (Object.keys(errors).length) throw validationError(errors);
}

// ─── Writes ──────────────────────────────────────────────────────

type Refs = { supplierId: number | null; brokerId: number | null; batchId: number | null };

async function resolveRefs(tenantId: string, input: PurchaseInput): Promise<Refs> {
  const [supplierId, brokerId, batchId] = await Promise.all([
    idOf(suppliers, tenantId, input.supplierKey, 'supplierKey', 'a supplier'),
    idOf(suppliers, tenantId, input.brokerKey, 'brokerKey', 'a broker'),
    idOf(batches, tenantId, input.batchKey, 'batchKey', 'a batch'),
  ]);
  return { supplierId, brokerId, batchId };
}

const headerValues = (input: PurchaseInput, refs: Refs) => ({
  number: input.number,
  purchaseDate: input.purchaseDate,
  sourceType: input.sourceType!,
  // The haat name only means something for a haat purchase.
  haatName: input.sourceType === 'haat' ? input.haatName : null,
  transportCost: input.transportCost,
  brokerFee: input.brokerFee,
  tollCost: input.tollCost,
  otherCost: input.otherCost,
  notes: input.notes,
  ...refs,
});

/** Price, shared-cost share and landed cost of each line, in input order. */
function costsOf(input: PurchaseInput) {
  const prices = input.items.map((i) => i.price ?? 0);
  const shares = splitSharedCost(prices, sharedCostOf(input));
  return prices.map((price, i) => ({ price, allocatedSharedCost: shares[i]!, landedCost: Math.round((price + shares[i]!) * 100) / 100 }));
}

/** The animal fields a purchase line controls. */
const animalValues = (item: PurchaseItemInput, input: PurchaseInput, batchId: number | null) => ({
  tag: item.tag,
  name: item.name,
  sex: item.sex!,
  type: item.type,
  breed: item.breed,
  batchId,
  origin: 'purchased',
  purchaseDate: input.purchaseDate,
});

/** Keeps the animal's "arrival" weighing in step with the entry weight (adds, updates or removes it). */
async function saveArrivalWeight(tx: Tx, tenantId: string, userId: string, animalId: number, batchId: number | null, date: string, weight: number | null) {
  const [existing] = await tx
    .select({ id: weightRecords.id })
    .from(weightRecords)
    .where(and(eq(weightRecords.animalId, animalId), eq(weightRecords.weighType, 'arrival'), notDeleted(weightRecords)))
    .limit(1);
  if (weight == null) {
    if (existing) await tx.update(weightRecords).set({ deletedAt: new Date(), deletedBy: userId }).where(eq(weightRecords.id, existing.id));
  } else if (existing) {
    await tx.update(weightRecords).set({ weight, weighDate: date, batchId, updatedBy: userId }).where(eq(weightRecords.id, existing.id));
  } else {
    await tx.insert(weightRecords).values({ tenantId, animalId, batchId, weighDate: date, weight, weightUnit: 'kg', weighType: 'arrival', createdBy: userId, updatedBy: userId });
  }
}

/** Adds a line's animal to the herd and the line itself. */
async function addLine(tx: Tx, tenantId: string, userId: string, purchaseId: number, input: PurchaseInput, item: PurchaseItemInput, cost: ReturnType<typeof costsOf>[number], batchId: number | null) {
  const [animal] = await tx
    .insert(animals)
    .values({ tenantId, ...animalValues(item, input, batchId), weight: item.entryWeightKg, herdStatus: 'in_herd', createdBy: userId, updatedBy: userId })
    .returning({ id: animals.id });
  await tx.insert(purchaseItems).values({ tenantId, purchaseId, animalId: animal!.id, ...cost, entryWeightKg: item.entryWeightKg, createdBy: userId, updatedBy: userId });
  await saveArrivalWeight(tx, tenantId, userId, animal!.id, batchId, input.purchaseDate, item.entryWeightKg);
}

export async function createPurchase(tenantId: string, userId: string, input: PurchaseInput) {
  const refs = await resolveRefs(tenantId, input);
  await assertNumberFree(tenantId, input.number);
  await assertTagsFree(tenantId, input.items, []);
  // Every line adds an animal: the plan's animal limit applies (402).
  await assertWithinLimit(tenantId, 'animals', await countAnimals(tenantId), input.items.length);

  const costs = costsOf(input);
  const key = await db.transaction(async (tx) => {
    const [purchase] = await tx
      .insert(purchases)
      .values({ tenantId, ...headerValues(input, refs), createdBy: userId, updatedBy: userId })
      .returning({ id: purchases.id, key: purchases.key });
    for (const [i, item] of input.items.entries()) await addLine(tx, tenantId, userId, purchase!.id, input, item, costs[i]!, refs.batchId);
    return purchase!.key;
  });
  // Weighings changed: gain / ADG, current weights and weight targets.
  await syncWeights(tenantId);
  return getPurchase(tenantId, key);
}

/** The purchase's id and its saved lines (with their animals). */
async function findWithLines(tenantId: string, key: string) {
  const [purchase] = await db.select({ id: purchases.id }).from(purchases).where(ofTenant(tenantId, eq(purchases.key, key)));
  if (!purchase) throw notFound('Purchase not found');
  const saved = await db
    .select({ id: purchaseItems.id, key: purchaseItems.key, animalId: purchaseItems.animalId, animalKey: animals.key })
    .from(purchaseItems)
    // animalKey is null when the animal was already deleted from the herd.
    .leftJoin(animals, and(eq(animals.id, purchaseItems.animalId), notDeleted(animals)))
    .where(and(eq(purchaseItems.purchaseId, purchase.id), notDeleted(purchaseItems)));
  return { id: purchase.id, saved };
}

/**
 * Lines with a `key` update their saved line and animal; lines without one are
 * added; saved lines left out are removed together with their animal.
 */
export async function updatePurchase(tenantId: string, userId: string, key: string, input: PurchaseInput) {
  const { id, saved } = await findWithLines(tenantId, key);
  const byKey = new Map(saved.map((s) => [s.key, s]));
  const unknown: Record<string, string[]> = {};
  input.items.forEach((item, i) => {
    if (item.key && !byKey.has(item.key)) unknown[`items.${i}.key`] = ['This line no longer exists'];
  });
  if (Object.keys(unknown).length) throw validationError(unknown);

  const keptKeys = new Set(input.items.map((i) => i.key).filter(Boolean));
  const removed = saved.filter((s) => !keptKeys.has(s.key));
  const refs = await resolveRefs(tenantId, input);
  await assertNumberFree(tenantId, input.number, id);
  await assertTagsFree(tenantId, input.items, saved.flatMap((s) => (s.animalId ? [s.animalId] : [])));
  const adding = input.items.filter((i) => !i.key).length;
  if (adding) await assertWithinLimit(tenantId, 'animals', await countAnimals(tenantId) - removed.length, adding);

  // Removed lines take their animal (and its history) with them; a parent animal blocks this (409).
  const removedAnimals = removed.flatMap((r) => (r.animalKey ? [r.animalKey] : []));
  if (removedAnimals.length) await animalCatalog.remove(tenantId, userId, removedAnimals);

  const costs = costsOf(input);
  await db.transaction(async (tx) => {
    await tx.update(purchases).set({ ...headerValues(input, refs), updatedBy: userId }).where(eq(purchases.id, id));
    for (const [i, item] of input.items.entries()) {
      const line = item.key ? byKey.get(item.key) : undefined;
      if (!line) {
        await addLine(tx, tenantId, userId, id, input, item, costs[i]!, refs.batchId);
        continue;
      }
      await tx.update(purchaseItems).set({ ...costs[i]!, entryWeightKg: item.entryWeightKg, updatedBy: userId }).where(eq(purchaseItems.id, line.id));
      if (line.animalId) {
        await tx.update(animals).set({ ...animalValues(item, input, refs.batchId), updatedBy: userId }).where(eq(animals.id, line.animalId));
        await saveArrivalWeight(tx, tenantId, userId, line.animalId, refs.batchId, input.purchaseDate, item.entryWeightKg);
      }
    }
    if (removed.length) {
      await tx
        .update(purchaseItems)
        .set({ deletedAt: new Date(), deletedBy: userId })
        .where(inArray(purchaseItems.id, removed.map((r) => r.id)));
    }
  });
  await syncWeights(tenantId);
  return getPurchase(tenantId, key);
}

/** Deletes the purchase, its lines and the animals it added (with their history). */
export async function deletePurchase(tenantId: string, userId: string, key: string) {
  const { id, saved } = await findWithLines(tenantId, key);
  const animalKeys = saved.flatMap((s) => (s.animalKey ? [s.animalKey] : []));
  if (animalKeys.length) await animalCatalog.remove(tenantId, userId, animalKeys);
  const deleted = { deletedAt: new Date(), deletedBy: userId };
  await db.transaction(async (tx) => {
    await tx.update(purchaseItems).set(deleted).where(and(eq(purchaseItems.purchaseId, id), notDeleted(purchaseItems)));
    await tx.update(purchases).set(deleted).where(eq(purchases.id, id));
  });
  await syncWeights(tenantId);
  return { animals: animalKeys.length };
}
