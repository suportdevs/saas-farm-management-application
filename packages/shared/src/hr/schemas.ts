import { z } from 'zod';
import { choice, decimal, optional, optionalDate, optionalEmail, optionalRef, required, status } from '../products/fields';
import { EMPLOYEE_GENDERS, EMPLOYMENT_TYPES } from './catalog';

// Create / update bodies of the HR catalogs (the modal form and each import row).

export const designationSchema = z.object({
  name: required('Name', 100),
  description: optional(1000),
});

export const employeeSchema = z.object({
  code: required('Employee ID', 30),
  name: required('Name', 150),
  designationKey: optionalRef,
  phone: optional(20),
  email: optionalEmail,
  gender: choice(EMPLOYEE_GENDERS, 'Gender'),
  dateOfBirth: optionalDate,
  nidNumber: optional(30),
  joiningDate: optionalDate,
  employmentType: choice(EMPLOYMENT_TYPES, 'Employment type', { fallback: 'permanent' }),
  salary: decimal(99_999_999),
  address: optional(500),
  emergencyContactName: optional(150),
  emergencyContactPhone: optional(20),
  status,
  notes: optional(1000),
});
