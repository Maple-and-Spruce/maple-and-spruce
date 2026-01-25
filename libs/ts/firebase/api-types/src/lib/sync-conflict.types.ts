/**
 * SyncConflict API request/response types
 *
 * Types for Firebase Cloud Function calls related to sync conflicts.
 * These are shared between client and server for type-safe API calls.
 *
 * @see ADR-012 for sync conflict detection and resolution strategy
 */
import type {
  SyncConflict,
  SyncConflictStatus,
  SyncConflictSummary,
  SyncResolution,
  ExternalSystem,
  SyncConflictType,
} from '@maple/ts/domain';

// ============================================================================
// Get Sync Conflicts
// ============================================================================

export interface GetSyncConflictsRequest {
  /** Filter by status (pending, resolved, ignored) */
  status?: SyncConflictStatus;
  /** Filter by conflict type */
  type?: SyncConflictType;
  /** Filter by external system (square, etsy) */
  system?: ExternalSystem;
  /** Filter by product ID */
  productId?: string;
}

export interface GetSyncConflictsResponse {
  conflicts: SyncConflict[];
}

// ============================================================================
// Get Sync Conflict Summary
// ============================================================================

export interface GetSyncConflictSummaryRequest {
  // No filters - returns summary of all conflicts
}

export interface GetSyncConflictSummaryResponse {
  summary: SyncConflictSummary;
}

// ============================================================================
// Resolve Sync Conflict
// ============================================================================

export interface ResolveSyncConflictRequest {
  /** The conflict ID to resolve */
  conflictId: string;
  /** How to resolve the conflict */
  resolution: SyncResolution;
  /** Optional notes (required for 'manual' resolution) */
  notes?: string;
}

export interface ResolveSyncConflictResponse {
  conflict: SyncConflict;
}

// ============================================================================
// Detect Sync Conflicts
// ============================================================================

export interface DetectSyncConflictsRequest {
  /** Optional: only check specific product IDs */
  productIds?: string[];
  /** Optional: only check specific external system */
  system?: ExternalSystem;
}

export interface DetectSyncConflictsResponse {
  /** Number of new conflicts detected */
  detected: number;
  /** Number of existing conflicts updated */
  updated: number;
  /** All currently pending conflicts */
  conflicts: SyncConflict[];
}
