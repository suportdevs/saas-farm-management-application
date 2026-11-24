import type { AnimalSex, AnimalType } from '../herd/catalog';
import type { PurchaseSourceType } from './constants';

/** A purchase in the list, with its totals. */
export interface PurchaseRow {
  key: string;
  number: string;
  /** YYYY-MM-DD */
  purchaseDate: string;
  sourceType: PurchaseSourceType;
  haatName: string | null;
  supplierKey: string | null;
  supplierName: string | null;
  brokerKey: string | null;
  brokerName: string | null;
  batchKey: string | null;
  batchName: string | null;
  transportCost: number;
  brokerFee: number;
  tollCost: number;
  otherCost: number;
  notes: string | null;
  /** Number of animals bought. */
  animals: number;
  /** Sum of the animal prices. */
  totalPrice: number;
  /** Transport + broker fee + toll + other. */
  sharedCost: number;
  /** Total price + shared cost. */
  totalLanded: number;
}

/** One animal line of a purchase. */
export interface PurchaseItemRow {
  key: string;
  animalKey: string | null;
  tag: string;
  name: string | null;
  sex: AnimalSex;
  type: AnimalType | null;
  breed: string | null;
  price: number;
  /** This animal's share of the transport / broker / toll / other costs. */
  allocatedSharedCost: number;
  /** price + allocated shared cost: the animal's opening cost. */
  landedCost: number;
  entryWeightKg: number | null;
}

export interface PurchaseDetail extends PurchaseRow {
  items: PurchaseItemRow[];
}
