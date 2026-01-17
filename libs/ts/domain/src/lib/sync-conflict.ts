/**
 * SyncConflict domain types
 *
 * Tracks detected mismatches between local data and external systems
 * (Square, Etsy). Surfaces issues in UI for admin resolution.
 */

export interface SyncConflict {
  id: string;
  productId: string;

  type: SyncConflictType;
  detectedAt: Date;

  /** Snapshot of local state when conflict detected */
  localState: SyncStateSnapshot;

  /** Snapshot of external system state when conflict detected */
  externalState: SyncStateSnapshot & {
    system: ExternalSystem;
  };

  status: SyncConflictStatus;
  resolution?: SyncResolution;
  resolvedAt?: Date;
  resolvedBy?: string;
  notes?: string;
}

export interface SyncStateSnapshot {
  quantity: number;
  price: number;
  name: string;
}

export type ExternalSystem = 'etsy' | 'square';

export type SyncConflictType =
  | 'quantity_mismatch' // Quantities don't match
  | 'price_mismatch' // Prices don't match
  | 'missing_local' // Exists externally, not in our system
  | 'missing_external' // Exists locally, not in external system
  | 'unexpected_sale'; // Sale on channel we didn't expect

export type SyncConflictStatus = 'pending' | 'resolved' | 'ignored';

export type SyncResolution =
  | 'use_local' // Push our data to external system
  | 'use_external' // Pull external data to us
  | 'manual' // User manually resolved (custom fix)
  | 'ignored'; // Acknowledged but intentionally not fixed

/**
 * Input for creating a sync conflict
 */
export type CreateSyncConflictInput = Omit<
  SyncConflict,
  'id' | 'status' | 'resolution' | 'resolvedAt' | 'resolvedBy' | 'notes'
>;

/**
 * Input for resolving a sync conflict
 */
export interface ResolveSyncConflictInput {
  conflictId: string;
  resolution: SyncResolution;
  notes?: string;
}

/**
 * Summary of sync conflicts for dashboard display
 */
export interface SyncConflictSummary {
  pending: number;
  resolved: number;
  ignored: number;
  byType: Record<SyncConflictType, number>;
  bySystem: Record<ExternalSystem, number>;
}
