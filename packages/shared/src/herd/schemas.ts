import { z } from 'zod';
import { choice, decimal, optional, optionalDate, optionalRef, ref, required, requiredDate, status } from '../products/fields';
import { ANIMAL_ORIGINS, ANIMAL_SEXES, ANIMAL_TYPES, BATCH_PURPOSES, HERD_STATUSES, PEN_TYPES, WEIGH_METHODS } from './catalog';

// Create / update bodies of the herd catalogs (the modal form and each import row).

export const penSchema = z.object({
  name: required('Name', 100),
  code: optional(30),
  type: choice(PEN_TYPES, 'Type'),
  capacity: decimal(100_000, undefined, { whole: true }),
  status,
  description: optional(500),
});

export const batchSchema = z.object({
  name: required('Name', 100),
  code: optional(30),
  purpose: choice(BATCH_PURPOSES, 'Purpose'),
  penKey: optionalRef,
  startDate: optionalDate,
  endDate: optionalDate,
  status,
  description: optional(500),
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
  weighedOn: requiredDate('Date'),
  weight: decimal(5_000, 'Weight'),
  method: choice(WEIGH_METHODS, 'Method'),
  notes: optional(500),
});

export type PenData = z.output<typeof penSchema>;
export type BatchData = z.output<typeof batchSchema>;
export type AnimalInput = z.input<typeof animalSchema>;
export type AnimalData = z.output<typeof animalSchema>;
export type WeightData = z.output<typeof weightSchema>;
