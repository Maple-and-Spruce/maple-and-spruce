/**
 * Delete Time Entry Cloud Function
 *
 * Admins can delete any entry. Employees can only delete their own
 * entries while unpaid.
 */
import {
  createAuthenticatedFunction,
  hasRole,
  Role,
  throwInvalidArgument,
  throwNotFound,
  throwFailedPrecondition,
} from '@maple/firebase/functions';
import { TimeEntryRepository } from '@maple/firebase/database';
import { HttpsError } from 'firebase-functions/v2/https';
import type {
  DeleteTimeEntryRequest,
  DeleteTimeEntryResponse,
} from '@maple/ts/firebase/api-types';

export const deleteTimeEntry = createAuthenticatedFunction<
  DeleteTimeEntryRequest,
  DeleteTimeEntryResponse
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
        'You can only delete your own time entries'
      );
    }
    if (existing.status === 'paid') {
      throwFailedPrecondition('Cannot delete a paid time entry');
    }
  }

  await TimeEntryRepository.delete(data.id);
  return { success: true };
});
