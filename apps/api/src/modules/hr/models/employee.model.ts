import { date, index, integer, numeric, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { activeUnique, audit, base, status } from '../../products/models/columns';
import { designations } from './designation.model';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

/** People who work on the farm. Choices (gender, employment type) are listed in shared hr/catalog.ts. */
export const employees = pgTable(
  'employees',
  {
    ...base(),
    /** Employee ID — unique per farm. */
    code: varchar('employee_code', { length: 30 }).notNull(),
    name: varchar('name', { length: 150 }).notNull(),
    designationId: integer('designation_id').references(() => designations.id),
    phone: varchar('phone', { length: 20 }),
    email: varchar('email', { length: 255 }),
    /** male · female · other */
    gender: varchar('gender', { length: 10 }),
    dateOfBirth: date('date_of_birth', { mode: 'string' }),
    /** National ID number. */
    nidNumber: varchar('nid_number', { length: 30 }),
    joiningDate: date('joining_date', { mode: 'string' }),
    /** permanent · contract · daily · seasonal */
    employmentType: varchar('employment_type', { length: 20 }).notNull().default('permanent'),
    /** Monthly salary, or the daily rate for daily-wage workers. */
    salary: numeric('salary', { precision: 12, scale: 2, mode: 'number' }),
    address: text('address'),
    emergencyContactName: varchar('emergency_contact_name', { length: 150 }),
    emergencyContactPhone: varchar('emergency_contact_phone', { length: 20 }),
    /** 1 = active, 0 = inactive (left the farm). */
    status: status(),
    notes: text('notes'),
    ...audit(),
  },
  (t) => [activeUnique('employees_employee_code_uq', t.tenantId, t.code), index('employees_designation_idx').on(t.designationId), index('employees_tenant_status_idx').on(t.tenantId, t.status)],
);
