import { jsonb, smallint, text, varchar } from 'drizzle-orm/pg-core';
import type { BankDetails } from '@kit/shared';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

/** Contact, address and bank columns shared by suppliers and customers. */
export const partyColumns = () => ({
  name: varchar('name', { length: 255 }).notNull(),
  code: varchar('code', { length: 50 }),
  contactPerson: varchar('contact_person', { length: 255 }),
  phone: varchar('phone', { length: 20 }),
  email: varchar('email', { length: 255 }),
  address: text('address'),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 100 }),
  country: varchar('country', { length: 100 }),
  taxId: varchar('tax_id', { length: 50 }),
  /** { bankName, accountName, accountNumber, branch } */
  bankDetails: jsonb('bank_details').$type<BankDetails>(),
  /** Stored as `is_active`: 1 = active, 0 = inactive (the catalog Status toggle). */
  status: smallint('is_active').notNull().default(1),
  notes: text('notes'),
});
