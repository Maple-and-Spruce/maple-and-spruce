/**
 * Create Time Entry Cloud Function
 *
 * Records hours worked. Admins can log entries for any employee; employees
 * can only log their own. The hourly rate is snapshotted onto the entry at
 * creation time (so that historical paid totals stay correct after rate
 * changes).
 */
import {
  createAuthenticatedFunction,
  hasRole,
  Role,
  throwInvalidArgument,
  throwNotFound,
  throwFailedPrecondition,
  throwValidationError,
} from '@maple/firebase/functions';
import {
  EmployeeRepository,
  TimeEntryRepository,
} from '@maple/firebase/database';
import { timeEntryValidation } from '@maple/ts/validation';
import type {
  CreateTimeEntryRequest,
  CreateTimeEntryResponse,
} from '@maple/ts/firebase/api-types';

export const createTimeEntry = createAuthenticatedFunction<
  CreateTimeEntryRequest,
  CreateTimeEntryResponse
>(async (data, context) => {
  if (!context.uid) {
    throwInvalidArgument('Authentication required');
  }

  const isAdmin = await hasRole(context.uid, Role.Admin);

  // Non-admins are forced to log their own hours regardless of payload.
  const employeeId = isAdmin ? data.employeeId : context.uid;

  const validationData = { ...data, employeeId };
  const validationResult = timeEntryValidation(validationData);
  if (validationResult.hasErrors()) {
    throwValidationError(validationResult.getErrors());
  }

  const employee = await EmployeeRepository.findById(employeeId);
  if (!employee) {
    throwNotFound('Employee', employeeId);
  }
  if (employee.status === 'inactive') {
    throwFailedPrecondition(
      'Cannot log time entries for an inactive employee'
    );
  }

  const entry = await TimeEntryRepository.create({
    employeeId,
    date: data.date,
    hours: data.hours,
    notes: data.notes,
    hourlyRateAtCreation: employee.hourlyRate,
  });

  return { entry };
});
