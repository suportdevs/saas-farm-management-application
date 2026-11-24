import type { Status } from '../products/catalog';
import type { AnimalOrigin, AnimalSex, AnimalType, BatchPurpose, BatchStatus, BreedType, HerdStatus, TargetWeightUnit, WeighMethod, WeighType, WeightTargetStatus } from './catalog';

/** Rows as listed by the API — only the columns the herd screens use. */
export interface PenRow {
  key: string;
  name: string;
  code: string | null;
  typeKey: string | null;
  typeName: string | null;
  capacity: number | null;
  status: Status;
  description: string | null;
}

export interface PenTypeRow {
  key: string;
  name: string;
  description: string | null;
}

export interface AnimalRow {
  key: string;
  tag: string;
  name: string | null;
  sex: AnimalSex;
  type: AnimalType | null;
  breed: string | null;
  penKey: string | null;
  penName: string | null;
  batchKey: string | null;
  batchName: string | null;
  /** YYYY-MM-DD */
  birthDate: string | null;
  origin: AnimalOrigin;
  purchaseDate: string | null;
  motherKey: string | null;
  /** The mother's ear tag. */
  motherName: string | null;
  fatherKey: string | null;
  fatherName: string | null;
  weight: number | null;
  herdStatus: HerdStatus;
  notes: string | null;
  /** Photo file name (also its cache-busting version), or null. */
  image: string | null;
}

export interface BatchRow {
  key: string;
  number: string;
  name: string | null;
  /** YYYY-MM-DD */
  arrivalDate: string;
  expectedExitDate: string | null;
  actualExitDate: string | null;
  supplierKey: string | null;
  supplierName: string | null;
  /** Counted live from the batch's animals. */
  totalAnimals: number;
  /** Of those, the ones still in the herd. */
  activeAnimals: number;
  status: BatchStatus;
  targetWeight: number | null;
  targetWeightUnit: TargetWeightUnit;
  totalPurchaseCost: number;
  totalSaleRevenue: number;
  purpose: BatchPurpose | null;
  penKey: string | null;
  penName: string | null;
  notes: string | null;
}

export interface WeightRow {
  key: string;
  animalKey: string;
  /** The animal's ear tag. */
  animalName: string;
  /** YYYY-MM-DD */
  weighDate: string;
  weight: number;
  weightUnit: TargetWeightUnit;
  /** Worked out from the animal's previous weighing (null for the first one). */
  previousWeight: number | null;
  weightGain: number | null;
  daysSinceLast: number | null;
  /** Average daily gain since the previous weighing. */
  adg: number | null;
  weighType: WeighType;
  bodyConditionScore: number | null;
  hipHeight: number | null;
  scaleId: string | null;
  weighMethod: WeighMethod | null;
  batchKey: string | null;
  batchName: string | null;
  /** Who recorded it (created_by). */
  recordedByName: string | null;
  notes: string | null;
}

export interface WeightTargetRow {
  key: string;
  animalKey: string | null;
  animalName: string | null;
  batchKey: string | null;
  batchName: string | null;
  targetWeight: number;
  /** YYYY-MM-DD */
  targetDate: string;
  targetAdg: number | null;
  /** Latest weight ÷ target, in %. */
  currentProgress: number | null;
  status: WeightTargetStatus;
}

export interface BreedRow {
  key: string;
  name: string;
  code: string | null;
  type: BreedType | null;
  originCountry: string | null;
  avgMatureWeight: number | null;
  description: string | null;
  /** Built-in breed shared by every farm: read-only. */
  isSystem: boolean;
}

export interface WarehouseRow {
  key: string;
  name: string;
  description: string | null;
}

export interface ColorMarkingRow {
  key: string;
  name: string;
  description: string | null;
}
