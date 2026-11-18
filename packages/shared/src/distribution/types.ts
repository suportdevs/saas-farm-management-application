import type { Status } from '../products/catalog';

/** Rows as listed by the API — only the columns the distribution screens use. */
export interface PartyTypeRow {
  key: string;
  name: string;
  description: string | null;
}
export type SupplierTypeRow = PartyTypeRow;
export type CustomerTypeRow = PartyTypeRow;

interface PartyRow {
  key: string;
  name: string;
  code: string | null;
  typeKey: string | null;
  typeName: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  taxId: string | null;
  /** From bank_details (JSON). */
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankBranch: string | null;
  status: Status;
  notes: string | null;
}

export interface SupplierRow extends PartyRow {
  rating: number | null;
}

export interface CustomerRow extends PartyRow {
  /** Comma-separated, from preferred_breeds (JSON list). */
  preferredBreeds: string | null;
  /** From preferred_weight_range (JSON), in kg. */
  preferredWeightMin: number | null;
  preferredWeightMax: number | null;
}

/** bank_details as stored. */
export interface BankDetails {
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  branch?: string;
}

/** preferred_weight_range as stored. */
export interface WeightRange {
  min: number | null;
  max: number | null;
  unit: 'kg';
}
