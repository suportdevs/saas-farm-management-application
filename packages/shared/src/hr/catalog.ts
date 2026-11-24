/**
 * HR catalogs: designations and employees. Same engine as the product catalog
 * (see products/catalog.ts) — one definition drives the API, the list, the
 * create/edit modal, the filters and CSV import/export.
 *
 * Only types are imported from products/catalog.ts: it imports this file.
 */

import type { CatalogChoice, CatalogColumn, CatalogDefinition } from '../products/catalog';

export const EMPLOYEE_GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
] as const satisfies readonly CatalogChoice[];

export const EMPLOYMENT_TYPES = [
  { value: 'permanent', label: 'Permanent' },
  { value: 'contract', label: 'Contract' },
  { value: 'daily', label: 'Daily wage' },
  { value: 'seasonal', label: 'Seasonal' },
] as const satisfies readonly CatalogChoice[];

type Values<T extends readonly CatalogChoice[]> = T[number]['value'];
export type EmployeeGender = Values<typeof EMPLOYEE_GENDERS>;
export type EmploymentType = Values<typeof EMPLOYMENT_TYPES>;

/** Details shown in the modal and CSV, but not as list columns. */
const detail = { list: false } as const;

const text = (key: string, csv: string, label: string, example: string, extra: Partial<CatalogColumn> = {}): CatalogColumn => ({ key, label, csv, example, ...extra });

export const HR_CATALOG = {
  designations: {
    module: 'hr',
    path: 'hr/designations',
    eyebrow: 'HR',
    label: 'Designation',
    plural: 'Designations',
    description: 'Job titles on the farm, e.g. Farm manager, Herdsman, Milker, Veterinarian.',
    columns: [
      text('name', 'name', 'Name', 'Herdsman', { required: true }),
      text('description', 'description', 'Description', 'Looks after the herd day to day', { input: 'textarea' }),
    ],
    filters: [],
  },
  employees: {
    module: 'hr',
    path: 'hr/employees',
    eyebrow: 'HR',
    label: 'Employee',
    plural: 'Employees',
    description: 'People who work on the farm — job, contact, pay and emergency contact.',
    columns: [
      text('code', 'employee_code', 'Employee ID', 'EMP-001', { required: true }),
      text('name', 'name', 'Name', 'Abdul Karim', { required: true }),
      { key: 'designationName', field: 'designationKey', label: 'Designation', csv: 'designation', ref: 'designations', example: 'Herdsman' },
      text('phone', 'phone', 'Phone', '+8801711000000'),
      text('email', 'email', 'Email', 'karim@example.com', detail),
      { key: 'gender', label: 'Gender', csv: 'gender', input: 'select', options: EMPLOYEE_GENDERS, example: 'Male', ...detail },
      text('dateOfBirth', 'date_of_birth', 'Date of birth', '1990-05-14', { input: 'date', ...detail }),
      text('nidNumber', 'nid_number', 'National ID', '1990123456789', detail),
      text('joiningDate', 'joining_date', 'Joining date', '2024-01-01', { input: 'date' }),
      { key: 'employmentType', label: 'Employment type', csv: 'employment_type', input: 'select', options: EMPLOYMENT_TYPES, defaultValue: 'permanent', example: 'Permanent' },
      text('salary', 'salary', 'Salary', '18000', { input: 'number', hint: 'Monthly salary, or the daily rate for daily-wage workers.' }),
      text('address', 'address', 'Address', 'Village Kashimpur, Gazipur', { input: 'textarea', ...detail }),
      text('emergencyContactName', 'emergency_contact_name', 'Emergency contact', 'Rahima Begum', detail),
      text('emergencyContactPhone', 'emergency_contact_phone', 'Emergency phone', '+8801811000000', detail),
      { key: 'status', label: 'Status', csv: 'status', input: 'status', example: 'Active' },
      text('notes', 'notes', 'Notes', 'Night shift', { input: 'textarea', ...detail }),
    ],
    filters: ['designation', 'employment_type', 'joining_date', 'status'],
  },
} satisfies Record<'designations' | 'employees', CatalogDefinition>;
