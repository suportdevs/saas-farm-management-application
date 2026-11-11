import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../../../core';
import { Catalog } from '../../products';
import { assertWithinLimit } from '../../subscriptions';
import { animals, batches, pens, weights } from '../models';

/** Animals still on the farm — what the plan's animal limit counts. */
export async function countAnimals(farmId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(animals)
    .where(and(eq(animals.tenantId, farmId), eq(animals.herdStatus, 'in_herd'), isNull(animals.deletedAt)));
  return row?.value ?? 0;
}

export const penCatalog = new Catalog({
  resource: 'pens',
  table: pens,
  fields: {
    key: pens.key,
    name: pens.name,
    code: pens.code,
    type: pens.type,
    capacity: pens.capacity,
    status: pens.status,
    description: pens.description,
  },
  search: [pens.name, pens.code],
  unique: [
    { index: 'pens_name_uq', column: pens.name, field: 'name' },
    { index: 'pens_code_uq', column: pens.code, field: 'code' },
  ],
  usedBy: [
    { table: animals, column: animals.penId, label: 'animal' },
    { table: batches, column: batches.penId, label: 'batch', plural: 'batches' },
  ],
});

export const batchCatalog = new Catalog({
  resource: 'batches',
  table: batches,
  fields: {
    key: batches.key,
    name: batches.name,
    code: batches.code,
    purpose: batches.purpose,
    penKey: pens.key,
    penName: pens.name,
    startDate: batches.startDate,
    endDate: batches.endDate,
    status: batches.status,
    description: batches.description,
  },
  joins: [{ table: pens, on: eq(pens.id, batches.penId), left: true }],
  search: [batches.name, batches.code],
  unique: [
    { index: 'batches_name_uq', column: batches.name, field: 'name' },
    { index: 'batches_code_uq', column: batches.code, field: 'code' },
  ],
  references: {
    penKey: { column: batches.penId, catalog: penCatalog, matchBy: pens.code },
  },
  usedBy: [{ table: animals, column: animals.batchId, label: 'animal' }],
});

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
    batchName: batches.name,
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
    batchKey: { column: animals.batchId, catalog: batchCatalog, matchBy: batches.code },
    // Imports match parents by ear tag.
    motherKey: { column: animals.motherId, catalog: () => animalCatalog, matchBy: animals.tag },
    fatherKey: { column: animals.fatherId, catalog: () => animalCatalog, matchBy: animals.tag },
  },
  // A parent with offspring on record can't be deleted (mark it Sold or Dead instead).
  usedBy: [
    { table: animals, column: animals.motherId, label: 'offspring record' },
    { table: animals, column: animals.fatherId, label: 'offspring record' },
  ],
  // An animal's weight records go with it.
  cascade: [{ table: weights, column: weights.animalId }],
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
