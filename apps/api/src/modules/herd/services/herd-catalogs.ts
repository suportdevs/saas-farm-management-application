import { and, count, eq, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../../../core';
import { Catalog } from '../../products';
import { assertWithinLimit } from '../../subscriptions';
import { animals, pens } from '../models';

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
  usedBy: [{ table: animals, column: animals.penId, label: 'animal' }],
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
    // Imports match parents by ear tag.
    motherKey: { column: animals.motherId, catalog: () => animalCatalog, matchBy: animals.tag },
    fatherKey: { column: animals.fatherId, catalog: () => animalCatalog, matchBy: animals.tag },
  },
  // A parent with offspring on record can't be deleted (mark it Sold or Dead instead).
  usedBy: [
    { table: animals, column: animals.motherId, label: 'offspring record' },
    { table: animals, column: animals.fatherId, label: 'offspring record' },
  ],
  // The plan's animal limit (402 PLAN_LIMIT_REACHED).
  async beforeCreate(tenantId, adding) {
    await assertWithinLimit(tenantId, 'animals', await countAnimals(tenantId), adding);
  },
});
