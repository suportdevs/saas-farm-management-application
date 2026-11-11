import type { Status } from '../products/catalog';
import type { AnimalOrigin, AnimalSex, AnimalType, HerdStatus, PenType } from './catalog';

/** Rows as listed by the API — only the columns the herd screens use. */
export interface PenRow {
  key: string;
  name: string;
  code: string | null;
  type: PenType | null;
  capacity: number | null;
  status: Status;
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
