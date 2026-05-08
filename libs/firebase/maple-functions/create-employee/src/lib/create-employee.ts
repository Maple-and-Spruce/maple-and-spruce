/**
 * Create Employee Cloud Function
 *
 * Admin-only. Grants `Role.Employee` to a user by creating their
 * `employees/{uid}` doc. The user must have already signed up (we don't
 * verify the UID exists in Firebase Auth here — invalid UIDs simply
 * never log in).
 */
import {
  createAdminFunction,
  throwAlreadyExists,
  throwInvalidArgument,
  throwValidationError,
} from '@maple/firebase/functions';
import { EmployeeRepository } from '@maple/firebase/database';
import { employeeValidation } from '@maple/ts/validation';
import type {
  CreateEmployeeRequest,
  CreateEmployeeResponse,
} from '@maple/ts/firebase/api-types';

export const createEmployee = createAdminFunction<
  CreateEmployeeRequest,
  CreateEmployeeResponse
>(async (data, context) => {
  if (!context.uid) throwInvalidArgument('Authentication required');

  const validationResult = employeeValidation(data);
  if (validationResult.hasErrors()) {
    throwValidationError(validationResult.getErrors());
  }

  const existing = await EmployeeRepository.findById(data.id);
  if (existing) {
    throwAlreadyExists('Employee', 'id', data.id);
  }

  const employee = await EmployeeRepository.create({
    id: data.id,
    name: data.name,
    email: data.email,
    hourlyRate: data.hourlyRate,
    grantedBy: context.uid,
  });

  return { employee };
});
