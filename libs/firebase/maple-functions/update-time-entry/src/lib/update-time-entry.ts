/**
 * Update Time Entry Cloud Function
 *
 * Admins can update any entry. Employees can only update their own
 * entries, and only while still unpaid — once Katie has paid out, the
 * entry is locked for non-admins.
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
import { TimeEntryRepository } from '@maple/firebase/database';
import { timeEntryValidation } from '@maple/ts/validation';
import { HttpsError } from 'firebase-functions/v2/https';
import type {
  UpdateTimeEntryRequest,
  UpdateTimeEntryResponse,
} from '@maple/ts/firebase/api-types';

export const updateTimeEntry = createAuthenticatedFunction<
  UpdateTimeEntryRequest,
  UpdateTimeEntryResponse
>(async (data, context) => {
  if (!context.uid) throwInvalidArgument('Authentication required');
  if (!data.id) throwInvalidArgument('Time entry ID is required');

  const existing = await TimeEntryRepository.findById(data.id);
  if (!existing) throwNotFound('TimeEntry', data.id);

  const isAdmin = await hasRole(context.uid, Role.Admin);
  if (!isAdmin) {
    if (existing.employeeId !== context.uid) {
      throw new HttpsError(
        'permission-denied',
        'You can only edit your own time entries'
      );
    }
    if (existing.status === 'paid') {
      throwFailedPrecondition('Cannot edit a paid time entry');
    }
  }

  const fieldsBeingUpdated = Object.keys(data).filter((k) => k !== 'id');
  if (fieldsBeingUpdated.length > 0) {
    const merged = { ...existing, ...data };
    const result = timeEntryValidation(merged, fieldsBeingUpdated);
    if (result.hasErrors()) {
      throwValidationError(result.getErrors());
    }
  }

  const entry = await TimeEntryRepository.update(data);
  return { entry };
});
