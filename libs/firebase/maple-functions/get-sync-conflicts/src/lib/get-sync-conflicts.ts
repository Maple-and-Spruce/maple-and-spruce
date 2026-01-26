/**
 * Get Sync Conflicts Cloud Function
 *
 * Retrieves all sync conflicts, optionally filtered by status, type, or system.
 * Deployed to us-east4 via CI/CD pipeline.
 *
 * @see ADR-012 for sync conflict detection and resolution strategy
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { SyncConflictRepository } from '@maple/firebase/database';
import type {
  GetSyncConflictsRequest,
  GetSyncConflictsResponse,
} from '@maple/ts/firebase/api-types';

export const getSyncConflicts = createAdminFunction<
  GetSyncConflictsRequest,
  GetSyncConflictsResponse
>(async (data) => {
  const conflicts = await SyncConflictRepository.findAll({
    status: data.status,
    type: data.type,
    system: data.system,
    productId: data.productId,
  });

  return { conflicts };
});
