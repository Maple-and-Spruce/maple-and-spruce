/**
 * Update Employee Cloud Function
 *
 * Admin-only. Updates name / hourlyRate / status. Setting status to
 * 'inactive' effectively revokes the employee role (hasRole() returns
 * false for inactive employees).
 */
import {
  createAdminFunction,
  throwInvalidArgument,
  throwNotFound,
  throwValidationError,
} from '@maple/firebase/functions';
import { EmployeeRepository } from '@maple/firebase/database';
import { employeeValidation } from '@maple/ts/validation';
import type {
  UpdateEmployeeRequest,
  UpdateEmployeeResponse,
} from '@maple/ts/firebase/api-types';

export const updateEmployee = createAdminFunction<
  UpdateEmployeeRequest,
  UpdateEmployeeResponse
>(async (data) => {
  if (!data.id) throwInvalidArgument('Employee ID is required');

  const existing = await EmployeeRepository.findById(data.id);
  if (!existing) throwNotFound('Employee', data.id);

  const fieldsBeingUpdated = Object.keys(data).filter((k) => k !== 'id');
  if (fieldsBeingUpdated.length > 0) {
    const merged = { ...existing, ...data };
    const result = employeeValidation(merged, fieldsBeingUpdated);
    if (result.hasErrors()) {
      throwValidationError(result.getErrors());
    }
  }

  const employee = await EmployeeRepository.update(data);
  return { employee };
});
