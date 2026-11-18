/**
 * Distribution catalogs: suppliers, customers and their types. Same engine as
 * the product catalog (see products/catalog.ts) — one definition drives the
 * API, the list, the create/edit modal, the filters and CSV import/export.
 *
 * Only types are imported from products/catalog.ts: it imports this file.
 */

import type { CatalogColumn, CatalogDefinition } from '../products/catalog';

/** A reference to a type catalog: `type` → row `typeName`, body `typeKey`. */
const typeRef = (resource: 'supplier-types' | 'customer-types', example: string): CatalogColumn => ({
  key: 'typeName',
  field: 'typeKey',
  label: 'Type',
  csv: 'type',
  ref: resource,
  example,
});

const text = (key: string, csv: string, label: string, example: string, extra: Partial<CatalogColumn> = {}): CatalogColumn => ({
  key,
  label,
  csv,
  example,
  ...extra,
});

/** Details shown in the modal and CSV, but not as list columns. */
const detail = { list: false } as const;

/** Contact and address columns shared by suppliers and customers. */
const contactColumns = (): CatalogColumn[] => [
  text('contactPerson', 'contact_person', 'Contact person', 'Rahim Uddin'),
  text('phone', 'phone', 'Phone', '+8801711000000'),
  text('email', 'email', 'Email', 'sales@example.com', detail),
  text('address', 'address', 'Address', 'House 12, Road 5', { input: 'textarea', ...detail }),
  text('city', 'city', 'City', 'Dhaka'),
  text('state', 'state', 'State / division', 'Dhaka', detail),
  text('country', 'country', 'Country', 'Bangladesh', detail),
  text('taxId', 'tax_id', 'Tax ID', 'TIN-123456', detail),
];

/** Stored together as `bank_details` (JSON). */
const bankColumns = (): CatalogColumn[] => [
  text('bankName', 'bank_name', 'Bank name', 'Dutch-Bangla Bank', detail),
  text('bankAccountName', 'bank_account_name', 'Account name', 'Green Feeds Ltd', detail),
  text('bankAccountNumber', 'bank_account_number', 'Account number', '1234567890', detail),
  text('bankBranch', 'bank_branch', 'Branch', 'Motijheel', detail),
];

const status: CatalogColumn = { key: 'status', label: 'Status', csv: 'status', input: 'status', example: 'Active' };
const notes: CatalogColumn = { key: 'notes', label: 'Notes', csv: 'notes', input: 'textarea', example: '', list: false };

const typeColumns = (example: string, description: string): CatalogColumn[] => [
  text('name', 'name', 'Name', example, { required: true }),
  text('description', 'description', 'Description', description, { input: 'textarea' }),
];

export const DISTRIBUTION_CATALOG = {
  suppliers: {
    module: 'distribution',
    path: 'distribution/suppliers',
    eyebrow: 'Distribution',
    label: 'Supplier',
    plural: 'Suppliers',
    description: 'Who the farm buys from — livestock, feed, veterinary supplies and equipment.',
    columns: [
      text('name', 'name', 'Name', 'Green Feeds Ltd', { required: true }),
      text('code', 'code', 'Code', 'SUP-001'),
      typeRef('supplier-types', 'Feed'),
      ...contactColumns(),
      ...bankColumns(),
      text('rating', 'rating', 'Rating (0–5)', '4.5', { input: 'number' }),
      status,
      notes,
    ],
    filters: ['type', 'status', 'rating'],
  },
  'supplier-types': {
    module: 'distribution',
    path: 'distribution/supplier-types',
    eyebrow: 'Distribution',
    label: 'Supplier type',
    plural: 'Supplier types',
    description: 'Kinds of suppliers, e.g. Livestock, Feed, Veterinary, Equipment.',
    columns: typeColumns('Feed', 'Feed and fodder suppliers'),
    filters: [],
  },
  customers: {
    module: 'distribution',
    path: 'distribution/customers',
    eyebrow: 'Distribution',
    label: 'Customer',
    plural: 'Customers',
    description: 'Who the farm sells to — slaughterhouses, traders, individuals and auctions.',
    columns: [
      text('name', 'name', 'Name', 'City Meat House', { required: true }),
      text('code', 'code', 'Code', 'CUS-001'),
      typeRef('customer-types', 'Slaughterhouse'),
      ...contactColumns(),
      ...bankColumns(),
      // Stored as JSON: a list of breed names and { min, max, unit: 'kg' }.
      text('preferredBreeds', 'preferred_breeds', 'Preferred breeds', 'Brahman, Sahiwal', { hint: 'Comma-separated breed names', ...detail }),
      text('preferredWeightMin', 'preferred_weight_min', 'Preferred weight from (kg)', '400', { input: 'number', ...detail }),
      text('preferredWeightMax', 'preferred_weight_max', 'Preferred weight to (kg)', '600', { input: 'number', ...detail }),
      status,
      notes,
    ],
    filters: ['type', 'status'],
  },
  'customer-types': {
    module: 'distribution',
    path: 'distribution/customer-types',
    eyebrow: 'Distribution',
    label: 'Customer type',
    plural: 'Customer types',
    description: 'Kinds of customers, e.g. Slaughterhouse, Trader, Individual, Auction.',
    columns: typeColumns('Slaughterhouse', 'Buys finished cattle'),
    filters: [],
  },
} satisfies Record<'suppliers' | 'supplier-types' | 'customers' | 'customer-types', CatalogDefinition>;
