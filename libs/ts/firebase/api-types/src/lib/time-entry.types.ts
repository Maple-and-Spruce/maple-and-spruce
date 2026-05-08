/**
 * Time entry API request/response types
 */
import type {
  TimeEntry,
  CreateTimeEntryInput,
  UpdateTimeEntryInput,
  TimeEntryStatus,
} from '@maple/ts/domain';

// ============================================================================
// Get Time Entries
// ============================================================================

export interface GetTimeEntriesRequest {
  /** Admin can pass any UID; non-admin is forced to their own UID server-side. */
  employeeId?: string;
  status?: TimeEntryStatus;
  /** YYYY-MM-DD inclusive */
  startDate?: string;
  /** YYYY-MM-DD inclusive */
  endDate?: string;
}

export interface GetTimeEntriesResponse {
  entries: TimeEntry[];
}

// ============================================================================
// Create Time Entry
// ============================================================================

export type CreateTimeEntryRequest = CreateTimeEntryInput;

export interface CreateTimeEntryResponse {
  entry: TimeEntry;
}

// ============================================================================
// Update Time Entry
// ============================================================================

export type UpdateTimeEntryRequest = UpdateTimeEntryInput;

export interface UpdateTimeEntryResponse {
  entry: TimeEntry;
}

// ============================================================================
// Delete Time Entry
// ============================================================================

export interface DeleteTimeEntryRequest {
  id: string;
}

export interface DeleteTimeEntryResponse {
  success: boolean;
}

// ============================================================================
// Mark Time Entries Paid (admin only, batch)
// ============================================================================

export interface MarkTimeEntriesPaidRequest {
  ids: string[];
}

export interface MarkTimeEntriesPaidResponse {
  /** IDs that successfully transitioned to paid */
  updatedIds: string[];
  /** Count of entries skipped because they were already paid */
  alreadyPaidCount: number;
}
