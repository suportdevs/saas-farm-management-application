/**
 * Herd catalogs: animals and the pens they live in. Same engine as the product
 * catalog (see products/catalog.ts) — one definition drives the API, the list,
 * the create/edit modal, the filters and CSV import/export.
 *
 * Only types are imported from products/catalog.ts: it imports this file.
 */

import type { CatalogChoice, CatalogColumn, CatalogDefinition } from '../products/catalog';

// ─── Choices ─────────────────────────────────────────────────────

export const ANIMAL_SEXES = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
] as const satisfies readonly CatalogChoice[];

export const ANIMAL_TYPES = [
  { value: 'cow', label: 'Cow' },
  { value: 'heifer', label: 'Heifer' },
  { value: 'calf', label: 'Calf' },
  { value: 'bull', label: 'Bull' },
  { value: 'steer', label: 'Steer' },
] as const satisfies readonly CatalogChoice[];

export const ANIMAL_ORIGINS = [
  { value: 'born', label: 'Born on farm' },
  { value: 'purchased', label: 'Purchased' },
] as const satisfies readonly CatalogChoice[];

/** Where the animal is now. Only `in_herd` animals count toward the plan's animal limit. */
export const HERD_STATUSES = [
  { value: 'in_herd', label: 'In herd' },
  { value: 'sold', label: 'Sold' },
  { value: 'dead', label: 'Dead' },
] as const satisfies readonly CatalogChoice[];

export const BATCH_PURPOSES = [
  { value: 'calves', label: 'Calves' },
  { value: 'heifers', label: 'Heifers' },
  { value: 'milking', label: 'Milking' },
  { value: 'dry', label: 'Dry cows' },
  { value: 'breeding', label: 'Breeding' },
  { value: 'fattening', label: 'Fattening' },
  { value: 'other', label: 'Other' },
] as const satisfies readonly CatalogChoice[];

export const BATCH_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const satisfies readonly CatalogChoice[];

export const TARGET_WEIGHT_UNITS = [
  { value: 'kg', label: 'kg' },
  { value: 'lb', label: 'lb' },
] as const satisfies readonly CatalogChoice[];

export const WEIGH_METHODS = [
  { value: 'scale', label: 'Scale' },
  { value: 'tape', label: 'Weigh tape' },
  { value: 'estimate', label: 'Visual estimate' },
] as const satisfies readonly CatalogChoice[];

/** Why an animal was moved to another pen. */
export const MOVEMENT_REASONS = [
  { value: 'routine', label: 'Routine' },
  { value: 'treatment', label: 'Treatment' },
  { value: 'sorting', label: 'Sorting' },
  { value: 'sale_prep', label: 'Sale prep' },
  { value: 'other', label: 'Other' },
] as const satisfies readonly CatalogChoice[];

export const BREED_TYPES = [
  { value: 'beef', label: 'Beef' },
  { value: 'dairy', label: 'Dairy' },
  { value: 'dual_purpose', label: 'Dual-purpose' },
] as const satisfies readonly CatalogChoice[];

type Values<T extends readonly CatalogChoice[]> = T[number]['value'];
export type BreedType = Values<typeof BREED_TYPES>;
export type BatchPurpose = Values<typeof BATCH_PURPOSES>;
export type BatchStatus = Values<typeof BATCH_STATUSES>;
export type TargetWeightUnit = Values<typeof TARGET_WEIGHT_UNITS>;
export type WeighMethod = Values<typeof WEIGH_METHODS>;
export type MovementReason = Values<typeof MOVEMENT_REASONS>;
export type AnimalSex = Values<typeof ANIMAL_SEXES>;
export type AnimalType = Values<typeof ANIMAL_TYPES>;
export type AnimalOrigin = Values<typeof ANIMAL_ORIGINS>;
export type HerdStatus = Values<typeof HERD_STATUSES>;

/** Label of a select value, e.g. `choiceLabel(ANIMAL_SEXES, 'female')` → "Female". */
export const choiceLabel = (options: readonly CatalogChoice[], value: unknown) => options.find((o) => o.value === value)?.label ?? String(value ?? '');

// ─── Definitions ─────────────────────────────────────────────────

/** A reference to another herd catalog: `pen` → row `penName`, body `penKey`. */
const ref = (csv: string, label: string, resource: 'animals' | 'pens' | 'pen-types' | 'batches' | 'suppliers', example: string, extra: Partial<CatalogColumn> = {}): CatalogColumn => ({
  key: `${csv}Name`,
  field: `${csv}Key`,
  label,
  csv,
  ref: resource,
  example,
  ...extra,
});

const select = (key: string, csv: string, label: string, options: readonly CatalogChoice[], example: string, extra: Partial<CatalogColumn> = {}): CatalogColumn => ({
  key,
  label,
  csv,
  input: 'select',
  options,
  example,
  ...extra,
});

export const HERD_CATALOG = {
  animals: {
    module: 'herd',
    path: 'herd',
    eyebrow: 'Herd',
    titleKey: 'tag',
    label: 'Animal',
    plural: 'Animals',
    description: 'Every animal on the farm — identity, pen, parents and where it is now.',
    columns: [
      { key: 'tag', label: 'Ear tag', csv: 'tag', required: true, example: 'BD-1024' },
      { key: 'name', label: 'Name', csv: 'name', example: 'Bella' },
      select('sex', 'sex', 'Sex', ANIMAL_SEXES, 'Female', { required: true, defaultValue: 'female' }),
      select('type', 'type', 'Type', ANIMAL_TYPES, 'Cow'),
      { key: 'breed', label: 'Breed', csv: 'breed', example: 'Holstein Friesian' },
      ref('pen', 'Pen', 'pens', 'Barn A'),
      ref('batch', 'Batch', 'batches', 'CALF-25'),
      { key: 'birthDate', label: 'Birth date', csv: 'birth_date', input: 'date', example: '2022-03-14' },
      select('origin', 'origin', 'Origin', ANIMAL_ORIGINS, 'Born on farm', { required: true, defaultValue: 'born' }),
      { key: 'purchaseDate', label: 'Purchase date', csv: 'purchase_date', input: 'date', example: '' },
      ref('mother', 'Mother (dam)', 'animals', 'BD-0890', { refFilters: { sex: 'female' } }),
      ref('father', 'Father (sire)', 'animals', '', { refFilters: { sex: 'male' } }),
      { key: 'weight', label: 'Weight (kg)', csv: 'weight', input: 'number', example: '540' },
      select('herdStatus', 'herd_status', 'Herd status', HERD_STATUSES, 'In herd', { required: true, defaultValue: 'in_herd' }),
      { key: 'notes', label: 'Notes', csv: 'notes', input: 'textarea', example: 'Calm, good milker' },
    ],
    filters: ['sex', 'type', 'pen', 'batch', 'origin', 'herd_status', 'weight'],
    image: true,
  },
  pens: {
    module: 'herd',
    path: 'herd/pens',
    eyebrow: 'Herd',
    label: 'Pen',
    plural: 'Pens',
    description: 'Barns, stalls and paddocks where animals are kept.',
    columns: [
      { key: 'name', label: 'Name', csv: 'name', required: true, example: 'Barn A' },
      { key: 'code', label: 'Code', csv: 'code', example: 'BA' },
      // Row `typeName`, body `typeKey`; imports match the pen type by name.
      ref('type', 'Pen type', 'pen-types', 'Barn'),
      { key: 'capacity', label: 'Capacity (animals)', csv: 'capacity', input: 'number', example: '60' },
      { key: 'status', label: 'Status', csv: 'status', input: 'status', example: 'Active' },
      { key: 'description', label: 'Description', csv: 'description', input: 'textarea', example: 'Milking herd, east side' },
    ],
    filters: ['type', 'status', 'capacity'],
  },
  'pen-types': {
    module: 'herd',
    path: 'herd/pen-types',
    eyebrow: 'Herd',
    label: 'Pen type',
    plural: 'Pen types',
    description: 'Kinds of pens on the farm, e.g. Feedlot, Quarantine, Hospital, Sorting.',
    columns: [
      { key: 'name', label: 'Type name', csv: 'type_name', required: true, example: 'Feedlot' },
      { key: 'description', label: 'Description', csv: 'description', input: 'textarea', example: 'Finishing cattle on a ration' },
    ],
    filters: [],
  },
  batches: {
    module: 'herd',
    path: 'herd/batches',
    eyebrow: 'Herd',
    label: 'Batch',
    plural: 'Batches',
    titleKey: 'number',
    description: 'Groups of animals bought, raised and sold together — arrival to exit, with costs and revenue.',
    columns: [
      { key: 'number', label: 'Batch number', csv: 'batch_number', required: true, example: 'B-2025-01' },
      { key: 'name', label: 'Batch name', csv: 'batch_name', example: 'Spring feeders' },
      { key: 'arrivalDate', label: 'Arrival date', csv: 'arrival_date', input: 'date', required: true, defaultValue: 'today', example: '2025-01-15' },
      { key: 'expectedExitDate', label: 'Expected exit', csv: 'expected_exit_date', input: 'date', example: '2025-07-15' },
      { key: 'actualExitDate', label: 'Actual exit', csv: 'actual_exit_date', input: 'date', example: '', list: false },
      { key: 'supplierName', field: 'supplierKey', label: 'Supplier', csv: 'supplier', ref: 'suppliers', example: 'SUP-001' },
      // Counted from the batch's animals, never typed in.
      { key: 'totalAnimals', label: 'Animals', csv: 'total_animals', input: 'number', readOnly: true, example: '' },
      { key: 'activeAnimals', label: 'In herd', csv: 'active_animals', input: 'number', readOnly: true, example: '' },
      select('status', 'status', 'Status', BATCH_STATUSES, 'Active', { required: true, defaultValue: 'active' }),
      { key: 'targetWeight', label: 'Target exit weight', csv: 'target_weight', input: 'number', example: '450', list: false },
      select('targetWeightUnit', 'target_weight_unit', 'Weight unit', TARGET_WEIGHT_UNITS, 'kg', { defaultValue: 'kg', list: false }),
      { key: 'totalPurchaseCost', label: 'Total purchase cost', csv: 'total_purchase_cost', input: 'number', example: '250000', list: false },
      { key: 'totalSaleRevenue', label: 'Total sale revenue', csv: 'total_sale_revenue', input: 'number', example: '0', list: false },
      select('purpose', 'purpose', 'Purpose', BATCH_PURPOSES, 'Fattening', { list: false }),
      ref('pen', 'Pen', 'pens', 'Barn A', { list: false }),
      { key: 'notes', label: 'Notes', csv: 'notes', input: 'textarea', example: 'Bought at the Hat market', list: false },
    ],
    filters: ['status', 'supplier', 'arrival_date', 'purpose', 'pen'],
  },
  weights: {
    module: 'herd',
    path: 'herd/weights',
    eyebrow: 'Herd',
    titleKey: 'animalName',
    label: 'Weight record',
    plural: 'Weights',
    description: 'Weighings of each animal. The latest one becomes the animal’s current weight.',
    columns: [
      ref('animal', 'Animal', 'animals', 'BD-1024', { required: true }),
      { key: 'weighedOn', label: 'Date', csv: 'date', input: 'date', required: true, defaultValue: 'today', example: '2025-06-01' },
      { key: 'weight', label: 'Weight (kg)', csv: 'weight', input: 'number', required: true, example: '312.5' },
      select('method', 'method', 'Method', WEIGH_METHODS, 'Scale', { defaultValue: 'scale' }),
      { key: 'notes', label: 'Notes', csv: 'notes', input: 'textarea', example: 'Before weaning' },
    ],
    filters: ['animal', 'date', 'weight', 'method'],
  },
  movements: {
    module: 'herd',
    path: 'herd/movements',
    eyebrow: 'Herd',
    titleKey: 'animalName',
    label: 'Movement',
    plural: 'Movements',
    description: 'Animals moved between pens. The latest movement sets the animal’s current pen.',
    columns: [
      ref('animal', 'Animal', 'animals', 'BD-1024', { required: true }),
      { key: 'movementDate', label: 'Date', csv: 'movement_date', input: 'date', required: true, defaultValue: 'today', example: '2025-06-01' },
      { key: 'fromPenName', field: 'fromPenKey', label: 'From pen', csv: 'from_pen', ref: 'pens', example: 'Barn A', hint: 'Leave empty to use the animal’s current pen.' },
      { key: 'toPenName', field: 'toPenKey', label: 'To pen', csv: 'to_pen', ref: 'pens', required: true, example: 'Barn B' },
      select('reason', 'reason', 'Reason', MOVEMENT_REASONS, 'Routine'),
      // Who recorded it (the created_by audit column), never typed in.
      { key: 'movedByName', label: 'Moved by', csv: 'moved_by', readOnly: true, example: '' },
      { key: 'notes', label: 'Notes', csv: 'notes', input: 'textarea', example: 'Moved for hoof treatment', list: false },
    ],
    filters: ['animal', 'movement_date', 'from_pen', 'to_pen', 'reason'],
  },
  'status-history': {
    module: 'herd',
    path: 'herd/status-history',
    eyebrow: 'Herd',
    titleKey: 'animalName',
    label: 'Status change',
    plural: 'Status history',
    description: 'Changes of an animal’s herd status (in herd, sold, dead). The latest one sets the animal’s current status.',
    columns: [
      ref('animal', 'Animal', 'animals', 'BD-1024', { required: true }),
      { key: 'changeDate', label: 'Date', csv: 'change_date', input: 'date', required: true, defaultValue: 'today', example: '2025-06-01' },
      select('previousStatus', 'previous_status', 'Previous status', HERD_STATUSES, 'In herd', { hint: 'Leave empty to use the animal’s current status.' }),
      select('newStatus', 'new_status', 'New status', HERD_STATUSES, 'Sold', { required: true }),
      { key: 'reason', label: 'Reason', csv: 'reason', input: 'textarea', example: 'Sold at the Hat market' },
      // Who recorded it (the created_by audit column), never typed in.
      { key: 'changedByName', label: 'Changed by', csv: 'changed_by', readOnly: true, example: '' },
    ],
    filters: ['animal', 'change_date', 'previous_status', 'new_status'],
  },
  breeds: {
    module: 'herd',
    path: 'herd/breeds',
    eyebrow: 'Herd',
    label: 'Breed',
    plural: 'Breeds',
    description: 'Cattle breeds. Built-in breeds are shared by every farm and read-only; add your own as needed.',
    columns: [
      { key: 'name', label: 'Breed name', csv: 'breed_name', required: true, example: 'Holstein Friesian' },
      { key: 'code', label: 'Breed code', csv: 'breed_code', example: 'HF' },
      select('type', 'breed_type', 'Breed type', BREED_TYPES, 'Dairy'),
      { key: 'originCountry', label: 'Origin country', csv: 'origin_country', example: 'Netherlands' },
      { key: 'avgMatureWeight', label: 'Avg. mature weight (kg)', csv: 'avg_mature_weight', input: 'number', example: '680' },
      { key: 'description', label: 'Description', csv: 'description', input: 'textarea', example: 'High-yielding black-and-white dairy breed' },
    ],
    filters: ['breed_type', 'avg_mature_weight'],
  },
  'color-markings': {
    module: 'herd',
    path: 'herd/color-markings',
    eyebrow: 'Herd',
    label: 'Color marking',
    plural: 'Color markings',
    description: 'Coat colors and markings used to describe animals, e.g. Black & white, Red, Brindle.',
    columns: [
      { key: 'name', label: 'Color name', csv: 'color_name', required: true, example: 'Black & white' },
      { key: 'description', label: 'Description', csv: 'description', input: 'textarea', example: 'Patched coat, typical of Holsteins' },
    ],
    filters: [],
  },
} satisfies Record<'animals' | 'pens' | 'pen-types' | 'batches' | 'weights' | 'movements' | 'status-history' | 'breeds' | 'color-markings', CatalogDefinition>;
