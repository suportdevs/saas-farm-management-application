import { eq } from 'drizzle-orm';
import { Catalog } from '../../products';
import { designations, employees } from '../models';

export const designationCatalog = new Catalog({
  resource: 'designations',
  table: designations,
  fields: {
    key: designations.key,
    name: designations.name,
    description: designations.description,
  },
  search: [designations.name, designations.description],
  unique: [{ index: 'designations_name_uq', column: designations.name, field: 'name' }],
  usedBy: [{ table: employees, column: employees.designationId, label: 'employee' }],
});

export const employeeCatalog = new Catalog({
  resource: 'employees',
  table: employees,
  fields: {
    key: employees.key,
    code: employees.code,
    name: employees.name,
    designationKey: designations.key,
    designationName: designations.name,
    phone: employees.phone,
    email: employees.email,
    gender: employees.gender,
    dateOfBirth: employees.dateOfBirth,
    nidNumber: employees.nidNumber,
    joiningDate: employees.joiningDate,
    employmentType: employees.employmentType,
    salary: employees.salary,
    address: employees.address,
    emergencyContactName: employees.emergencyContactName,
    emergencyContactPhone: employees.emergencyContactPhone,
    status: employees.status,
    notes: employees.notes,
  },
  joins: [{ table: designations, on: eq(designations.id, employees.designationId), left: true }],
  search: [employees.code, employees.name, employees.phone, employees.nidNumber],
  unique: [{ index: 'employees_employee_code_uq', column: employees.code, field: 'code' }],
  references: {
    // Imports match the designation by name.
    designationKey: { column: employees.designationId, catalog: designationCatalog, matchBy: designations.name },
  },
});
