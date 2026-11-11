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

export const PEN_TYPES = [
  { value: 'barn', label: 'Barn' },
  { value: 'free_stall', label: 'Free stall' },
  { value: 'paddock', label: 'Paddock' },
  { value: 'calf_pen', label: 'Calf pen' },
  { value: 'maternity', label: 'Maternity' },
  { value: 'isolation', label: 'Isolation' },
  { value: 'other', label: 'Other' },
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

export const WEIGH_METHODS = [
  { value: 'scale', label: 'Scale' },
  { value: 'tape', label: 'Weigh tape' },
  { value: 'estimate', label: 'Visual estimate' },
] as const satisfies readonly CatalogChoice[];

type Values<T extends readonly CatalogChoice[]> = T[number]['value'];
export type BatchPurpose = Values<typeof BATCH_PURPOSES>;
export type WeighMethod = Values<typeof WEIGH_METHODS>;
export type AnimalSex = Values<typeof ANIMAL_SEXES>;
export type AnimalType = Values<typeof ANIMAL_TYPES>;
export type AnimalOrigin = Values<typeof ANIMAL_ORIGINS>;
export type HerdStatus = Values<typeof HERD_STATUSES>;
export type PenType = Values<typeof PEN_TYPES>;

/** Label of a select value, e.g. `choiceLabel(ANIMAL_SEXES, 'female')` → "Female". */
export const choiceLabel = (options: readonly CatalogChoice[], value: unknown) => options.find((o) => o.value === value)?.label ?? String(value ?? '');

// ─── Definitions ─────────────────────────────────────────────────

/** A reference to another herd catalog: `pen` → row `penName`, body `penKey`. */
const ref = (csv: string, label: string, resource: 'animals' | 'pens' | 'batches', example: string, extra: Partial<CatalogColumn> = {}): CatalogColumn => ({
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
      select('type', 'type', 'Type', PEN_TYPES, 'Barn'),
      { key: 'capacity', label: 'Capacity (animals)', csv: 'capacity', input: 'number', example: '60' },
      { key: 'status', label: 'Status', csv: 'status', input: 'status', example: 'Active' },
      { key: 'description', label: 'Description', csv: 'description', input: 'textarea', example: 'Milking herd, east side' },
    ],
    filters: ['type', 'status', 'capacity'],
  },
  batches: {
    module: 'herd',
    path: 'herd/batches',
    eyebrow: 'Herd',
    label: 'Batch',
    plural: 'Batches',
    description: 'Groups of animals managed together, e.g. this year’s calves or the dry cows.',
    columns: [
      { key: 'name', label: 'Name', csv: 'name', required: true, example: 'Calves 2025' },
      { key: 'code', label: 'Code', csv: 'code', example: 'CALF-25' },
      select('purpose', 'purpose', 'Purpose', BATCH_PURPOSES, 'Calves'),
      ref('pen', 'Pen', 'pens', 'Barn A'),
      { key: 'startDate', label: 'Start date', csv: 'start_date', input: 'date', example: '2025-01-01' },
      { key: 'endDate', label: 'End date', csv: 'end_date', input: 'date', example: '' },
      { key: 'status', label: 'Status', csv: 'status', input: 'status', example: 'Active' },
      { key: 'description', label: 'Description', csv: 'description', input: 'textarea', example: 'Spring-born calves' },
    ],
    filters: ['purpose', 'pen', 'status', 'start_date'],
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
} satisfies Record<'animals' | 'pens' | 'batches' | 'weights', CatalogDefinition>;
