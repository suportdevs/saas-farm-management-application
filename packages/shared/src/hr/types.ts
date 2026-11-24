import type { Status } from '../products/catalog';
import type { EmployeeGender, EmploymentType } from './catalog';

export interface DesignationRow {
  key: string;
  name: string;
  description: string | null;
}

export interface EmployeeRow {
  key: string;
  code: string;
  name: string;
  designationKey: string | null;
  designationName: string | null;
  phone: string | null;
  email: string | null;
  gender: EmployeeGender | null;
  /** YYYY-MM-DD */
  dateOfBirth: string | null;
  nidNumber: string | null;
  /** YYYY-MM-DD */
  joiningDate: string | null;
  employmentType: EmploymentType;
  /** Monthly salary, or the daily rate for daily-wage workers. */
  salary: number | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  status: Status;
  notes: string | null;
}
