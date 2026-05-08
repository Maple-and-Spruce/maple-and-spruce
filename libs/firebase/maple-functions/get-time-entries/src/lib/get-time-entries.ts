/**
 * Get Time Entries Cloud Function
 *
 * Returns time entries the caller is allowed to see. Admins can pass
 * any `employeeId`; non-admin employees are scoped to their own UID
 * regardless of what they ask for.
 */
import {
  createAuthenticatedFunction,
  hasRole,
  Role,
  throwInvalidArgument,
} from '@maple/firebase/functions';
import { TimeEntryRepository } from '@maple/firebase/database';
import type {
  GetTimeEntriesRequest,
  GetTimeEntriesResponse,
} from '@maple/ts/firebase/api-types';

export const getTimeEntries = createAuthenticatedFunction<
  GetTimeEntriesRequest,
  GetTimeEntriesResponse
>(async (data, context) => {
  if (!context.uid) throwInvalidArgument('Authentication required');

  const isAdmin = await hasRole(context.uid, Role.Admin);
  const employeeId = isAdmin ? data.employeeId : context.uid;

  const entries = await TimeEntryRepository.findAll({
    employeeId,
    status: data.status,
    startDate: data.startDate,
    endDate: data.endDate,
  });

  return { entries };
});
