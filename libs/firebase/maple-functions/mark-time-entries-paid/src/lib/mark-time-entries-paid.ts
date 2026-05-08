/**
 * Mark Time Entries Paid Cloud Function
 *
 * Admin-only batch operation. Transitions a list of unpaid entries to
 * 'paid', stamping `paidAt` and `paidBy`. Already-paid entries are
 * silently skipped (counted in the response so the UI can flag drift).
 */
import {
  createAdminFunction,
  throwInvalidArgument,
} from '@maple/firebase/functions';
import { TimeEntryRepository } from '@maple/firebase/database';
import type {
  MarkTimeEntriesPaidRequest,
  MarkTimeEntriesPaidResponse,
} from '@maple/ts/firebase/api-types';

export const markTimeEntriesPaid = createAdminFunction<
  MarkTimeEntriesPaidRequest,
  MarkTimeEntriesPaidResponse
>(async (data, context) => {
  if (!context.uid) throwInvalidArgument('Authentication required');
  if (!Array.isArray(data.ids) || data.ids.length === 0) {
    throwInvalidArgument('At least one time entry ID is required');
  }

  return TimeEntryRepository.markPaid(data.ids, context.uid);
});
