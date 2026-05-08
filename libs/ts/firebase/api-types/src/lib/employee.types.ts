/**
 * Employee API request/response types
 */
import type {
  Employee,
  EmployeeWithUnpaid,
  CreateEmployeeInput,
  UpdateEmployeeInput,
} from '@maple/ts/domain';

// ============================================================================
// Get Employees (admin)
// ============================================================================

export interface GetEmployeesRequest {
  includeInactive?: boolean;
}

export interface GetEmployeesResponse {
  employees: EmployeeWithUnpaid[];
}

// ============================================================================
// Create Employee (admin grants role + sets rate)
// ============================================================================

export type CreateEmployeeRequest = CreateEmployeeInput;

export interface CreateEmployeeResponse {
  employee: Employee;
}

// ============================================================================
// Update Employee
// ============================================================================

export type UpdateEmployeeRequest = UpdateEmployeeInput;

export interface UpdateEmployeeResponse {
  employee: Employee;
}
