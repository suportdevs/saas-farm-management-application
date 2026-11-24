import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../../../core';
import { users } from '../../../db/schema';
import { supplierCatalog, suppliers } from '../../distribution';
import { Catalog } from '../../products';
import { assertWithinLimit } from '../../subscriptions';
import { animalMovements, animals, animalStatusHistory, batches, breeds, colorMarkings, pens, penTypes, weights } from '../models';

/** Animals still on the farm — what the plan's animal limit counts. */
export async function countAnimals(farmId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(animals)
    .where(and(eq(animals.tenantId, farmId), eq(animals.herdStatus, 'in_herd'), isNull(animals.deletedAt)));
  return row?.value ?? 0;
}

export const breedCatalog = new Catalog({
  resource: 'breeds',
  table: breeds,
  fields: {
    key: breeds.key,
    name: breeds.name,
    code: breeds.code,
    type: breeds.type,
    originCountry: breeds.originCountry,
    avgMatureWeight: breeds.avgMatureWeight,
    description: breeds.description,
    isSystem: breeds.isSystem,
  },
  search: [breeds.name, breeds.code, breeds.originCountry],
  unique: [{ index: 'breeds_breed_name_uq', column: breeds.name, field: 'name' }],
  // Built-in breeds (tenant_id null) show for every farm and can't be changed.
  systemRows: true,
});

export const colorMarkingCatalog = new Catalog({
  resource: 'color-markings',
  table: colorMarkings,
  fields: {
    key: colorMarkings.key,
    name: colorMarkings.name,
    description: colorMarkings.description,
  },
  search: [colorMarkings.name],
  unique: [{ index: 'color_markings_color_name_uq', column: colorMarkings.name, field: 'name' }],
});

export const penTypeCatalog = new Catalog({
  resource: 'pen-types',
  table: penTypes,
  fields: {
    key: penTypes.key,
    name: penTypes.name,
    description: penTypes.description,
  },
  search: [penTypes.name],
  unique: [{ index: 'pen_types_type_name_uq', column: penTypes.name, field: 'name' }],
  usedBy: [{ table: pens, column: pens.penTypeId, label: 'pen' }],
});

export const penCatalog = new Catalog({
  resource: 'pens',
  table: pens,
  fields: {
    key: pens.key,
    name: pens.name,
    code: pens.code,
    typeKey: penTypes.key,
    typeName: penTypes.name,
    capacity: pens.capacity,
    status: pens.status,
    description: pens.description,
  },
  joins: [{ table: penTypes, on: eq(penTypes.id, pens.penTypeId), left: true }],
  search: [pens.name, pens.code],
  unique: [
    { index: 'pens_name_uq', column: pens.name, field: 'name' },
    { index: 'pens_code_uq', column: pens.code, field: 'code' },
  ],
  references: {
    // Imports match the pen type by name.
    typeKey: { column: pens.penTypeId, catalog: penTypeCatalog, matchBy: penTypes.name },
  },
  usedBy: [
    { table: animals, column: animals.penId, label: 'animal' },
    { table: batches, column: batches.penId, label: 'batch', plural: 'batches' },
    { table: animalMovements, column: animalMovements.toPenId, label: 'movement' },
    { table: animalMovements, column: animalMovements.fromPenId, label: 'movement' },
  ],
});

/** Animals of a batch (not deleted), optionally only the ones still in the herd. */
const batchAnimals = (inHerd: boolean) =>
  sql<number>`(select count(*)::int from ${animals} a where a.batch_id = ${batches.id} and a.deleted_at is null${inHerd ? sql` and a.herd_status = 'in_herd'` : sql``})`;

export const batchCatalog = new Catalog({
  resource: 'batches',
  table: batches,
  fields: {
    key: batches.key,
    number: batches.number,
    name: batches.name,
    arrivalDate: batches.arrivalDate,
    expectedExitDate: batches.expectedExitDate,
    actualExitDate: batches.actualExitDate,
    supplierKey: suppliers.key,
    supplierName: suppliers.name,
    // Counted live, so they never drift from the animal register.
    totalAnimals: batchAnimals(false),
    activeAnimals: batchAnimals(true),
    status: batches.status,
    targetWeight: batches.targetWeight,
    targetWeightUnit: batches.targetWeightUnit,
    totalPurchaseCost: batches.totalPurchaseCost,
    totalSaleRevenue: batches.totalSaleRevenue,
    purpose: batches.purpose,
    penKey: pens.key,
    penName: pens.name,
    notes: batches.notes,
  },
  joins: [
    { table: suppliers, on: eq(suppliers.id, batches.supplierId), left: true },
    { table: pens, on: eq(pens.id, batches.penId), left: true },
  ],
  search: [batches.number, batches.name],
  // Selects show "B-2025-01 · Spring feeders"; newest arrivals first.
  title: sql<string>`concat_ws(' · ', ${batches.number}, ${batches.name})`,
  orderBy: desc(batches.arrivalDate),
  unique: [{ index: 'batches_batch_number_uq', column: batches.number, field: 'number' }],
  references: {
    // Imports match the supplier by code (or name) and the pen by code (or name).
    supplierKey: { column: batches.supplierId, catalog: supplierCatalog, matchBy: suppliers.code },
    penKey: { column: batches.penId, catalog: penCatalog, matchBy: pens.code },
  },
  usedBy: [{ table: animals, column: animals.batchId, label: 'animal' }],
});

// Distribution can't import the herd module, so the herd tells it: a supplier with batches can't be deleted.
supplierCatalog.addUsedBy({ table: batches, column: batches.supplierId, label: 'batch', plural: 'batches' });

// An animal's parents are animals too: the same table joined twice under other names.
const mother = alias(animals, 'mother');
const father = alias(animals, 'father');

export const animalCatalog: Catalog = new Catalog({
  resource: 'animals',
  table: animals,
  // Only the key and tag / name of each reference — never the whole rows.
  fields: {
    key: animals.key,
    tag: animals.tag,
    name: animals.name,
    sex: animals.sex,
    type: animals.type,
    breed: animals.breed,
    penKey: pens.key,
    penName: pens.name,
    batchKey: batches.key,
    // The batch number: a batch name is optional.
    batchName: batches.number,
    birthDate: animals.birthDate,
    origin: animals.origin,
    purchaseDate: animals.purchaseDate,
    motherKey: mother.key,
    motherName: mother.tag,
    fatherKey: father.key,
    fatherName: father.tag,
    weight: animals.weight,
    herdStatus: animals.herdStatus,
    notes: animals.notes,
    image: animals.image,
  },
  joins: [
    { table: pens, on: eq(pens.id, animals.penId), left: true },
    { table: batches, on: eq(batches.id, animals.batchId), left: true },
    { table: mother, on: eq(mother.id, animals.motherId), left: true },
    { table: father, on: eq(father.id, animals.fatherId), left: true },
  ],
  search: [animals.tag, animals.name, animals.breed],
  // Selects show "BD-1024 · Bella"; lists are sorted by ear tag.
  title: sql<string>`concat_ws(' · ', ${animals.tag}, ${animals.name})`,
  orderBy: animals.tag,
  unique: [{ index: 'animals_tag_uq', column: animals.tag, field: 'tag' }],
  references: {
    penKey: { column: animals.penId, catalog: penCatalog, matchBy: pens.code },
    batchKey: { column: animals.batchId, catalog: batchCatalog, matchBy: batches.number },
    // Imports match parents by ear tag.
    motherKey: { column: animals.motherId, catalog: () => animalCatalog, matchBy: animals.tag },
    fatherKey: { column: animals.fatherId, catalog: () => animalCatalog, matchBy: animals.tag },
  },
  // A parent with offspring on record can't be deleted (mark it Sold or Dead instead).
  usedBy: [
    { table: animals, column: animals.motherId, label: 'offspring record' },
    { table: animals, column: animals.fatherId, label: 'offspring record' },
  ],
  // An animal's weight records, movements and status changes go with it.
  cascade: [
    { table: weights, column: weights.animalId },
    { table: animalMovements, column: animalMovements.animalId },
    { table: animalStatusHistory, column: animalStatusHistory.animalId },
  ],
  // The plan's animal limit (402 PLAN_LIMIT_REACHED).
  async beforeCreate(tenantId, adding) {
    await assertWithinLimit(tenantId, 'animals', await countAnimals(tenantId), adding);
  },
});

/**
 * Copies each animal's latest weighing (by date, then entry order) to
 * `animals.weight`, so the animal list shows its current weight.
 */
export async function syncLatestWeights(tenantId: string) {
  await db.execute(sql`
    update ${animals} as a set weight = w.weight
    from (
      select distinct on (animal_id) animal_id, weight
      from ${weights}
      where tenant_id = ${tenantId} and deleted_at is null
      order by animal_id, weighed_on desc, id desc
    ) as w
    where a.id = w.animal_id and a.weight is distinct from w.weight
  `);
}

const weighed = alias(animals, 'weighed');

export const weightCatalog = new Catalog({
  resource: 'weights',
  table: weights,
  fields: {
    key: weights.key,
    animalKey: weighed.key,
    animalName: weighed.tag,
    weighedOn: weights.weighedOn,
    weight: weights.weight,
    method: weights.method,
    notes: weights.notes,
  },
  joins: [{ table: weighed, on: eq(weighed.id, weights.animalId) }],
  search: [weights.notes],
  // Weight records have no name: newest first.
  title: sql<string>`${weights.weighedOn}::text`,
  orderBy: desc(weights.weighedOn),
  unique: [],
  references: {
    // Imports match the animal by ear tag.
    animalKey: { column: weights.animalId, catalog: animalCatalog, matchBy: animals.tag },
  },
  afterWrite: syncLatestWeights,
});

// ─── Movements ───────────────────────────────────────────────────

/**
 * After movements change:
 * 1. an animal's latest movement saved without "From pen" gets the pen the
 *    animal was in (its pen hasn't been updated yet at that point);
 * 2. each animal's latest movement (by date, then entry order) becomes its pen.
 */
export async function syncAnimalPens(tenantId: string) {
  const latest = sql`
    select distinct on (animal_id) id, animal_id, to_pen_id
    from ${animalMovements}
    where tenant_id = ${tenantId} and deleted_at is null
    order by animal_id, movement_date desc, id desc`;
  await db.execute(sql`
    update ${animalMovements} as m set from_pen_id = a.pen_id
    from (${latest}) as l, ${animals} as a
    where m.id = l.id and a.id = l.animal_id and m.from_pen_id is null and a.pen_id is distinct from l.to_pen_id
  `);
  await db.execute(sql`
    update ${animals} as a set pen_id = l.to_pen_id
    from (${latest}) as l
    where a.id = l.animal_id and a.pen_id is distinct from l.to_pen_id
  `);
}

const moved = alias(animals, 'moved');
const fromPen = alias(pens, 'from_pen');
const toPen = alias(pens, 'to_pen');
const mover = alias(users, 'mover');

export const movementCatalog = new Catalog({
  resource: 'movements',
  table: animalMovements,
  fields: {
    key: animalMovements.key,
    animalKey: moved.key,
    animalName: moved.tag,
    movementDate: animalMovements.movementDate,
    fromPenKey: fromPen.key,
    fromPenName: fromPen.name,
    toPenKey: toPen.key,
    toPenName: toPen.name,
    reason: animalMovements.reason,
    movedByName: mover.name,
    notes: animalMovements.notes,
  },
  joins: [
    { table: moved, on: eq(moved.id, animalMovements.animalId) },
    { table: fromPen, on: eq(fromPen.id, animalMovements.fromPenId), left: true },
    { table: toPen, on: eq(toPen.id, animalMovements.toPenId) },
    { table: mover, on: eq(mover.id, animalMovements.createdBy), left: true },
  ],
  search: [animalMovements.notes],
  // Movements have no name: newest first.
  title: sql<string>`${animalMovements.movementDate}::text`,
  orderBy: desc(animalMovements.movementDate),
  unique: [],
  references: {
    // Imports match the animal by ear tag and the pens by code.
    animalKey: { column: animalMovements.animalId, catalog: animalCatalog, matchBy: animals.tag },
    fromPenKey: { column: animalMovements.fromPenId, catalog: penCatalog, matchBy: pens.code },
    toPenKey: { column: animalMovements.toPenId, catalog: penCatalog, matchBy: pens.code },
  },
  afterWrite: syncAnimalPens,
});

// ─── Status history ──────────────────────────────────────────────

/**
 * After status changes change:
 * 1. an animal's latest change saved without "Previous status" gets the
 *    animal's status at that point;
 * 2. each animal's latest change (by date, then entry order) becomes its herd status.
 */
export async function syncAnimalStatuses(tenantId: string) {
  const latest = sql`
    select distinct on (animal_id) id, animal_id, new_status
    from ${animalStatusHistory}
    where tenant_id = ${tenantId} and deleted_at is null
    order by animal_id, change_date desc, id desc`;
  await db.execute(sql`
    update ${animalStatusHistory} as h set previous_status = a.herd_status
    from (${latest}) as l, ${animals} as a
    where h.id = l.id and a.id = l.animal_id and h.previous_status is null and a.herd_status is distinct from l.new_status
  `);
  await db.execute(sql`
    update ${animals} as a set herd_status = l.new_status
    from (${latest}) as l
    where a.id = l.animal_id and a.herd_status is distinct from l.new_status
  `);
}

const changedAnimal = alias(animals, 'changed_animal');
const changer = alias(users, 'changer');

export const statusHistoryCatalog = new Catalog({
  resource: 'status-history',
  table: animalStatusHistory,
  fields: {
    key: animalStatusHistory.key,
    animalKey: changedAnimal.key,
    animalName: changedAnimal.tag,
    changeDate: animalStatusHistory.changeDate,
    previousStatus: animalStatusHistory.previousStatus,
    newStatus: animalStatusHistory.newStatus,
    reason: animalStatusHistory.reason,
    changedByName: changer.name,
  },
  joins: [
    { table: changedAnimal, on: eq(changedAnimal.id, animalStatusHistory.animalId) },
    { table: changer, on: eq(changer.id, animalStatusHistory.createdBy), left: true },
  ],
  search: [animalStatusHistory.reason],
  title: sql<string>`${animalStatusHistory.changeDate}::text`,
  orderBy: desc(animalStatusHistory.changeDate),
  unique: [],
  references: {
    animalKey: { column: animalStatusHistory.animalId, catalog: animalCatalog, matchBy: animals.tag },
  },
  afterWrite: syncAnimalStatuses,
});
