import { z } from 'zod';
import { decimal, optional, optionalEmail, optionalRef, required, status } from '../products/fields';

// Create / update bodies of the distribution catalogs (the modal form and each import row).

const typeSchema = z.object({
  name: required('Name', 255),
  description: optional(1000),
});
export const supplierTypeSchema = typeSchema;
export const customerTypeSchema = typeSchema;

/** Contact, address and bank fields shared by suppliers and customers. */
const party = {
  name: required('Name', 255),
  code: optional(50),
  typeKey: optionalRef,
  contactPerson: optional(255),
  phone: optional(20),
  email: optionalEmail,
  address: optional(1000),
  city: optional(100),
  state: optional(100),
  country: optional(100),
  taxId: optional(50),
  // Saved together as bank_details (JSON).
  bankName: optional(100),
  bankAccountName: optional(255),
  bankAccountNumber: optional(50),
  bankBranch: optional(100),
  status,
  notes: optional(2000),
};

export const supplierSchema = z.object({
  ...party,
  rating: decimal(5),
});

export const customerSchema = z.object({
  ...party,
  /** Comma-separated breed names, saved as a JSON list. */
  preferredBreeds: optional(500),
  // Saved together as preferred_weight_range { min, max, unit: 'kg' }.
  preferredWeightMin: decimal(5_000),
  preferredWeightMax: decimal(5_000),
});

export type SupplierData = z.output<typeof supplierSchema>;
export type CustomerData = z.output<typeof customerSchema>;
