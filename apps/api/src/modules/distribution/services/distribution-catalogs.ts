import { eq, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { BankDetails, WeightRange } from '@kit/shared';
import { Catalog } from '../../products';
import { customers, customerTypes, suppliers, supplierTypes } from '../models';

type Values = Record<string, unknown>;

// ─── JSON columns ↔ form fields ──────────────────────────────────
// The modal and CSV use flat fields (bankName, preferredWeightMin…); the
// tables keep them as JSON. `encode` packs them before a write, `fields`
// unpacks them for reads.

/** bankName, bankAccountName, bankAccountNumber, bankBranch → bank_details (null when all are empty). */
function packBank({ bankName, bankAccountName, bankAccountNumber, bankBranch, ...rest }: Values): Values {
  const details: BankDetails = Object.fromEntries(
    Object.entries({ bankName, accountName: bankAccountName, accountNumber: bankAccountNumber, branch: bankBranch }).filter(([, v]) => v),
  );
  return { ...rest, bankDetails: Object.keys(details).length ? details : null };
}

/** "Brahman, Sahiwal" → ["Brahman", "Sahiwal"]; min / max → { min, max, unit: 'kg' }. */
function packPreferences({ preferredBreeds, preferredWeightMin, preferredWeightMax, ...rest }: Values): Values {
  const breeds = typeof preferredBreeds === 'string' ? preferredBreeds.split(',').map((b) => b.trim()).filter(Boolean) : [];
  const min = (preferredWeightMin as number | null) ?? null;
  const max = (preferredWeightMax as number | null) ?? null;
  const range: WeightRange | null = min === null && max === null ? null : { min, max, unit: 'kg' };
  return { ...rest, preferredBreeds: breeds.length ? breeds : null, preferredWeightRange: range };
}

/** One text value out of a JSON column. */
const jsonText = (column: PgColumn, key: string) => sql<string | null>`${column} ->> ${key}`;

/** The list columns of bank_details, named like the form fields. */
const bankFields = (column: PgColumn) => ({
  bankName: jsonText(column, 'bankName'),
  bankAccountName: jsonText(column, 'accountName'),
  bankAccountNumber: jsonText(column, 'accountNumber'),
  bankBranch: jsonText(column, 'branch'),
});

// ─── Types ───────────────────────────────────────────────────────

export const supplierTypeCatalog = new Catalog({
  resource: 'supplier-types',
  table: supplierTypes,
  fields: { key: supplierTypes.key, name: supplierTypes.name, description: supplierTypes.description },
  search: [supplierTypes.name],
  unique: [{ index: 'supplier_types_name_uq', column: supplierTypes.name, field: 'name' }],
  usedBy: [{ table: suppliers, column: suppliers.typeId, label: 'supplier' }],
});

export const customerTypeCatalog = new Catalog({
  resource: 'customer-types',
  table: customerTypes,
  fields: { key: customerTypes.key, name: customerTypes.name, description: customerTypes.description },
  search: [customerTypes.name],
  unique: [{ index: 'customer_types_name_uq', column: customerTypes.name, field: 'name' }],
  usedBy: [{ table: customers, column: customers.typeId, label: 'customer' }],
});

// ─── Suppliers and customers ─────────────────────────────────────

export const supplierCatalog = new Catalog({
  resource: 'suppliers',
  table: suppliers,
  fields: {
    key: suppliers.key,
    name: suppliers.name,
    code: suppliers.code,
    typeKey: supplierTypes.key,
    typeName: supplierTypes.name,
    contactPerson: suppliers.contactPerson,
    phone: suppliers.phone,
    email: suppliers.email,
    address: suppliers.address,
    city: suppliers.city,
    state: suppliers.state,
    country: suppliers.country,
    taxId: suppliers.taxId,
    ...bankFields(suppliers.bankDetails),
    rating: suppliers.rating,
    status: suppliers.status,
    notes: suppliers.notes,
  },
  joins: [{ table: supplierTypes, on: eq(supplierTypes.id, suppliers.typeId), left: true }],
  search: [suppliers.name, suppliers.code, suppliers.contactPerson, suppliers.phone, suppliers.city],
  unique: [{ index: 'suppliers_code_uq', column: suppliers.code, field: 'code' }],
  references: {
    // Imports match the type by name.
    typeKey: { column: suppliers.typeId, catalog: supplierTypeCatalog, matchBy: supplierTypes.name },
  },
  encode: packBank,
});

export const customerCatalog = new Catalog({
  resource: 'customers',
  table: customers,
  fields: {
    key: customers.key,
    name: customers.name,
    code: customers.code,
    typeKey: customerTypes.key,
    typeName: customerTypes.name,
    contactPerson: customers.contactPerson,
    phone: customers.phone,
    email: customers.email,
    address: customers.address,
    city: customers.city,
    state: customers.state,
    country: customers.country,
    taxId: customers.taxId,
    ...bankFields(customers.bankDetails),
    preferredBreeds: sql<string | null>`(select string_agg(b, ', ') from jsonb_array_elements_text(${customers.preferredBreeds}) as b)`,
    preferredWeightMin: sql<number | null>`(${customers.preferredWeightRange} ->> 'min')::float8`,
    preferredWeightMax: sql<number | null>`(${customers.preferredWeightRange} ->> 'max')::float8`,
    status: customers.status,
    notes: customers.notes,
  },
  joins: [{ table: customerTypes, on: eq(customerTypes.id, customers.typeId), left: true }],
  search: [customers.name, customers.code, customers.contactPerson, customers.phone, customers.city],
  unique: [{ index: 'customers_code_uq', column: customers.code, field: 'code' }],
  references: {
    typeKey: { column: customers.typeId, catalog: customerTypeCatalog, matchBy: customerTypes.name },
  },
  encode: (values) => packPreferences(packBank(values)),
});
