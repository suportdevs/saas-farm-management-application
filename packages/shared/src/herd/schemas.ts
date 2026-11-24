import { z } from 'zod';
import { choice, decimal, optional, optionalDate, optionalRef, ref, required, requiredDate, status } from '../products/fields';
import { ANIMAL_ORIGINS, ANIMAL_SEXES, ANIMAL_TYPES, BATCH_PURPOSES, BATCH_STATUSES, BREED_TYPES, HERD_STATUSES, MOVEMENT_REASONS, TARGET_WEIGHT_UNITS, WEIGH_METHODS, WEIGH_TYPES } from './catalog';

// Create / update bodies of the herd catalogs (the modal form and each import row).

export const penSchema = z.object({
  name: required('Name', 100),
  code: optional(30),
  typeKey: optionalRef,
  capacity: decimal(100_000, undefined, { whole: true }),
  status,
  description: optional(500),
});

export const penTypeSchema = z.object({
  name: required('Type name', 100),
  description: optional(500),
});

/** A money total: empty → 0. */
const money = decimal(9_999_999_999).transform((v) => v ?? 0);

export const batchSchema = z.object({
  number: required('Batch number', 50),
  name: optional(255),
  arrivalDate: requiredDate('Arrival date'),
  expectedExitDate: optionalDate,
  actualExitDate: optionalDate,
  supplierKey: optionalRef,
  status: choice(BATCH_STATUSES, 'Status', { fallback: 'active' }),
  targetWeight: decimal(5_000),
  targetWeightUnit: choice(TARGET_WEIGHT_UNITS, 'Weight unit', { fallback: 'kg' }),
  totalPurchaseCost: money,
  totalSaleRevenue: money,
  purpose: choice(BATCH_PURPOSES, 'Purpose'),
  penKey: optionalRef,
  notes: optional(2000),
});

export const animalSchema = z.object({
  tag: required('Ear tag', 50),
  name: optional(100),
  sex: choice(ANIMAL_SEXES, 'Sex', { required: true }),
  type: choice(ANIMAL_TYPES, 'Type'),
  breed: optional(100),
  penKey: optionalRef,
  batchKey: optionalRef,
  birthDate: optionalDate,
  origin: choice(ANIMAL_ORIGINS, 'Origin', { fallback: 'born' }),
  purchaseDate: optionalDate,
  motherKey: optionalRef,
  fatherKey: optionalRef,
  weight: decimal(5_000),
  herdStatus: choice(HERD_STATUSES, 'Herd status', { fallback: 'in_herd' }),
  notes: optional(1000),
});

export const weightSchema = z.object({
  animalKey: ref('Choose an animal'),
  weighDate: requiredDate('Weigh date'),
  weight: decimal(5_000, 'Weight'),
  weightUnit: choice(TARGET_WEIGHT_UNITS, 'Unit', { fallback: 'kg' }),
  weighType: choice(WEIGH_TYPES, 'Weigh type', { fallback: 'routine' }),
  bodyConditionScore: decimal(99),
  hipHeight: decimal(9_999),
  weighMethod: choice(WEIGH_METHODS, 'Weigh method'),
  scaleId: optional(50),
  batchKey: optionalRef,
  notes: optional(500),
});

/** An animal or a batch is required — checked by the API (the form shows the error on Animal). */
export const weightTargetSchema = z.object({
  animalKey: optionalRef,
  batchKey: optionalRef,
  targetWeight: decimal(5_000, 'Target weight'),
  targetDate: requiredDate('Target date'),
  targetAdg: decimal(999),
});

export const movementSchema = z.object({
  animalKey: ref('Choose an animal'),
  movementDate: requiredDate('Date'),
  fromPenKey: optionalRef,
  toPenKey: ref('Choose the pen it moved to'),
  reason: choice(MOVEMENT_REASONS, 'Reason'),
  notes: optional(2000),
});

export const statusChangeSchema = z.object({
  animalKey: ref('Choose an animal'),
  changeDate: requiredDate('Date'),
  previousStatus: choice(HERD_STATUSES, 'Previous status'),
  newStatus: choice(HERD_STATUSES, 'New status', { required: true }),
  reason: optional(2000),
});

export const breedSchema = z.object({
  name: required('Breed name', 100),
  code: optional(50),
  type: choice(BREED_TYPES, 'Breed type'),
  originCountry: optional(100),
  avgMatureWeight: decimal(5_000),
  description: optional(500),
});

export const warehouseSchema = z.object({
  name: required('Name', 100),
  description: optional(1000),
});

export const colorMarkingSchema = z.object({
  name: required('Color name', 50),
  description: optional(500),
});

export type PenData = z.output<typeof penSchema>;
export type BreedData = z.output<typeof breedSchema>;
export type ColorMarkingData = z.output<typeof colorMarkingSchema>;
export type PenTypeData = z.output<typeof penTypeSchema>;
export type BatchData = z.output<typeof batchSchema>;
export type AnimalInput = z.input<typeof animalSchema>;
export type AnimalData = z.output<typeof animalSchema>;
export type WeightData = z.output<typeof weightSchema>;
