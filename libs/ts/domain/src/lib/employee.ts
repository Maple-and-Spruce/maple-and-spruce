/**
 * Employee domain types
 *
 * Represents a person paid hourly by Maple & Spruce (e.g. shop help).
 * Distinct from Instructor (paid per-class) and Artist (commission).
 *
 * The employee record lives at `employees/{uid}` so the document ID is
 * the user's Firebase Auth UID — granting Role.Employee is the same
 * write that creates the employee record.
 */

export type EmployeeStatus = 'active' | 'inactive';

export interface Employee {
  /** Firebase Auth UID — also the Firestore document ID */
  id: string;
  name: string;
  email: string;
  /** Hourly pay in dollars (e.g. 18.5 = $18.50/hr) */
  hourlyRate: number;
  status: EmployeeStatus;
  /** Admin UID who granted the employee role */
  grantedBy: string;
  grantedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateEmployeeInput = Pick<
  Employee,
  'id' | 'name' | 'email' | 'hourlyRate'
>;

export type UpdateEmployeeInput = {
  id: string;
  name?: string;
  hourlyRate?: number;
  status?: EmployeeStatus;
};

/**
 * Summary of unpaid hours for an employee. Returned by the admin
 * "Employees" listing so Katie sees what's owed at a glance.
 */
export interface EmployeeWithUnpaid {
  employee: Employee;
  unpaidHours: number;
  unpaidAmountDollars: number;
}
