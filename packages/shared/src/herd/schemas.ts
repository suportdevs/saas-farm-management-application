import { z } from 'zod';
import { choice, decimal, optional, optionalDate, optionalRef, required, status } from '../products/fields';
import { ANIMAL_ORIGINS, ANIMAL_SEXES, ANIMAL_TYPES, HERD_STATUSES, PEN_TYPES } from './catalog';

// Create / update bodies of the herd catalogs (the modal form and each import row).

export const penSchema = z.object({
  name: required('Name', 100),
  code: optional(30),
  type: choice(PEN_TYPES, 'Type'),
  capacity: decimal(100_000, undefined, { whole: true }),
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
  birthDate: optionalDate,
  origin: choice(ANIMAL_ORIGINS, 'Origin', { fallback: 'born' }),
  purchaseDate: optionalDate,
  motherKey: optionalRef,
  fatherKey: optionalRef,
  weight: decimal(5_000),
  herdStatus: choice(HERD_STATUSES, 'Herd status', { fallback: 'in_herd' }),
  notes: optional(1000),
});

export type PenData = z.output<typeof penSchema>;
export type AnimalInput = z.input<typeof animalSchema>;
export type AnimalData = z.output<typeof animalSchema>;
