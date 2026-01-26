/**
 * SyncConflict Repository
 *
 * Handles all Firestore operations for sync conflicts.
 * All database access should go through this repository.
 *
 * Sync conflicts track mismatches between local Firestore data
 * and external systems (Square, Etsy) for manual resolution.
 *
 * @see ADR-012 for sync conflict strategy
 */
import { db } from './utilities/database.config';
import type {
  SyncConflict,
  SyncConflictStatus,
  SyncConflictType,
  SyncResolution,
  CreateSyncConflictInput,
  SyncConflictSummary,
  ExternalSystem,
} from '@maple/ts/domain';

const COLLECTION = 'syncConflicts';

/**
 * Convert Firestore document to SyncConflict
 */
function docToSyncConflict(
  doc: FirebaseFirestore.DocumentSnapshot
): SyncConflict | undefined {
  if (!doc.exists) {
    return undefined;
  }

  const data = doc.data()!;
  return {
    id: doc.id,
    productId: data.productId,
    type: data.type,
    detectedAt: data.detectedAt?.toDate() ?? new Date(),
    localState: {
      quantity: data.localState.quantity,
      price: data.localState.price,
      name: data.localState.name,
    },
    externalState: {
      system: data.externalState.system,
      quantity: data.externalState.quantity,
      price: data.externalState.price,
      name: data.externalState.name,
    },
    status: data.status,
    resolution: data.resolution,
    resolvedAt: data.resolvedAt?.toDate(),
    resolvedBy: data.resolvedBy,
    notes: data.notes,
  };
}

/**
 * Filter options for finding sync conflicts
 */
export interface SyncConflictFilters {
  status?: SyncConflictStatus;
  type?: SyncConflictType;
  system?: ExternalSystem;
  productId?: string;
}

/**
 * SyncConflict Repository - handles all Firestore operations for sync conflicts
 */
export const SyncConflictRepository = {
  /**
   * Find all sync conflicts, optionally filtered
   */
  async findAll(filters?: SyncConflictFilters): Promise<SyncConflict[]> {
    let query: FirebaseFirestore.Query = db.collection(COLLECTION);

    if (filters?.status) {
      query = query.where('status', '==', filters.status);
    }

    if (filters?.type) {
      query = query.where('type', '==', filters.type);
    }

    if (filters?.system) {
      query = query.where('externalState.system', '==', filters.system);
    }

    if (filters?.productId) {
      query = query.where('productId', '==', filters.productId);
    }

    query = query.orderBy('detectedAt', 'desc');

    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => docToSyncConflict(doc))
      .filter((c): c is SyncConflict => c !== undefined);
  },

  /**
   * Find a sync conflict by ID
   */
  async findById(id: string): Promise<SyncConflict | undefined> {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return docToSyncConflict(doc);
  },

  /**
   * Find all pending sync conflicts
   */
  async findPending(): Promise<SyncConflict[]> {
    return this.findAll({ status: 'pending' });
  },

  /**
   * Find existing pending conflict for a product and type
   * Used to avoid creating duplicate conflicts
   */
  async findExistingConflict(
    productId: string,
    type: SyncConflictType,
    system: ExternalSystem
  ): Promise<SyncConflict | undefined> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('productId', '==', productId)
      .where('type', '==', type)
      .where('externalState.system', '==', system)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return undefined;
    }

    return docToSyncConflict(snapshot.docs[0]);
  },

  /**
   * Create a new sync conflict
   */
  async create(input: CreateSyncConflictInput): Promise<SyncConflict> {
    const docRef = db.collection(COLLECTION).doc();

    const data = {
      productId: input.productId,
      type: input.type,
      detectedAt: input.detectedAt,
      localState: input.localState,
      externalState: input.externalState,
      status: 'pending' as SyncConflictStatus,
    };

    await docRef.set(data);

    return {
      id: docRef.id,
      ...data,
    };
  },

  /**
   * Resolve a sync conflict
   */
  async resolve(
    id: string,
    resolution: SyncResolution,
    resolvedBy: string,
    notes?: string
  ): Promise<SyncConflict> {
    const docRef = db.collection(COLLECTION).doc(id);
    const now = new Date();

    const updates: Record<string, unknown> = {
      status: 'resolved' as SyncConflictStatus,
      resolution,
      resolvedBy,
      resolvedAt: now,
    };

    if (notes !== undefined) {
      updates.notes = notes;
    }

    await docRef.update(updates);

    const updated = await docRef.get();
    const conflict = docToSyncConflict(updated);

    if (!conflict) {
      throw new Error(`SyncConflict ${id} not found after update`);
    }

    return conflict;
  },

  /**
   * Mark a sync conflict as ignored
   * Shorthand for resolve(id, 'ignored', ...)
   */
  async ignore(
    id: string,
    resolvedBy: string,
    notes?: string
  ): Promise<SyncConflict> {
    return this.resolve(id, 'ignored', resolvedBy, notes);
  },

  /**
   * Delete a sync conflict
   * Note: Typically conflicts should be resolved, not deleted
   */
  async delete(id: string): Promise<void> {
    await db.collection(COLLECTION).doc(id).delete();
  },

  /**
   * Get summary counts of sync conflicts
   * Used for navigation badge and dashboard
   */
  async getSummary(): Promise<SyncConflictSummary> {
    const allConflicts = await this.findAll();

    const summary: SyncConflictSummary = {
      pending: 0,
      resolved: 0,
      ignored: 0,
      byType: {
        quantity_mismatch: 0,
        price_mismatch: 0,
        missing_local: 0,
        missing_external: 0,
        unexpected_sale: 0,
      },
      bySystem: {
        square: 0,
        etsy: 0,
      },
    };

    for (const conflict of allConflicts) {
      // Count by status
      if (conflict.status === 'pending') {
        summary.pending++;
      } else if (conflict.status === 'resolved') {
        if (conflict.resolution === 'ignored') {
          summary.ignored++;
        } else {
          summary.resolved++;
        }
      }

      // Count by type (only pending conflicts)
      if (conflict.status === 'pending') {
        summary.byType[conflict.type]++;
        summary.bySystem[conflict.externalState.system]++;
      }
    }

    return summary;
  },

  /**
   * Update an existing conflict with new state snapshots
   * Used when re-detecting a conflict that still exists
   */
  async updateState(
    id: string,
    localState: SyncConflict['localState'],
    externalState: SyncConflict['externalState']
  ): Promise<SyncConflict> {
    const docRef = db.collection(COLLECTION).doc(id);

    await docRef.update({
      localState,
      externalState,
      detectedAt: new Date(),
    });

    const updated = await docRef.get();
    const conflict = docToSyncConflict(updated);

    if (!conflict) {
      throw new Error(`SyncConflict ${id} not found after update`);
    }

    return conflict;
  },
};
