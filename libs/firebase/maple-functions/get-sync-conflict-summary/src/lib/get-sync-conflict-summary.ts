/**
 * Get Sync Conflict Summary Cloud Function
 *
 * Returns summary counts of sync conflicts for dashboard display and nav badge.
 * Deployed to us-east4 via CI/CD pipeline.
 *
 * @see ADR-012 for sync conflict detection and resolution strategy
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { SyncConflictRepository } from '@maple/firebase/database';
import type {
  GetSyncConflictSummaryRequest,
  GetSyncConflictSummaryResponse,
} from '@maple/ts/firebase/api-types';

export const getSyncConflictSummary = createAdminFunction<
  GetSyncConflictSummaryRequest,
  GetSyncConflictSummaryResponse
>(async () => {
  const summary = await SyncConflictRepository.getSummary();

  return { summary };
});
