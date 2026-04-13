import { describe, it, expect } from 'vitest';
import type {
  SyncConflict,
  SyncStateSnapshot,
  ExternalSystem,
  SyncConflictType,
  SyncConflictStatus,
  SyncResolution,
  CreateSyncConflictInput,
  ResolveSyncConflictInput,
  SyncConflictSummary,
} from './sync-conflict';

// Force v8 to process the module for coverage
import * as syncConflictModule from './sync-conflict';

describe('SyncConflict types', () => {
  const localState: SyncStateSnapshot = {
    quantity: 10,
    price: 2500,
    name: 'Ceramic Mug',
  };

  const externalState: SyncStateSnapshot & { system: ExternalSystem } = {
    quantity: 8,
    price: 2500,
    name: 'Ceramic Mug',
    system: 'square',
  };

  const baseConflict: SyncConflict = {
    id: 'conflict-1',
    productId: 'prod-1',
    type: 'quantity_mismatch',
    detectedAt: new Date(),
    localState,
    externalState,
    status: 'pending',
  };

  it('creates a pending sync conflict', () => {
    expect(baseConflict.status).toBe('pending');
    expect(baseConflict.type).toBe('quantity_mismatch');
    expect(baseConflict.localState.quantity).toBe(10);
    expect(baseConflict.externalState.system).toBe('square');
  });

  it('creates a resolved sync conflict', () => {
    const resolved: SyncConflict = {
      ...baseConflict,
      status: 'resolved',
      resolution: 'use_local',
      resolvedAt: new Date(),
      resolvedBy: 'admin-1',
      notes: 'Pushed our quantity to Square',
    };
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolution).toBe('use_local');
    expect(resolved.resolvedBy).toBe('admin-1');
  });

  it('creates an ignored sync conflict', () => {
    const ignored: SyncConflict = {
      ...baseConflict,
      status: 'ignored',
      resolution: 'ignored',
    };
    expect(ignored.status).toBe('ignored');
  });

  it('covers all ExternalSystem values', () => {
    const systems: ExternalSystem[] = ['etsy', 'square'];
    expect(systems).toHaveLength(2);
  });

  it('covers all SyncConflictType values', () => {
    const types: SyncConflictType[] = [
      'quantity_mismatch',
      'price_mismatch',
      'missing_local',
      'missing_external',
      'unexpected_sale',
    ];
    expect(types).toHaveLength(5);
  });

  it('covers all SyncConflictStatus values', () => {
    const statuses: SyncConflictStatus[] = ['pending', 'resolved', 'ignored'];
    expect(statuses).toHaveLength(3);
  });

  it('covers all SyncResolution values', () => {
    const resolutions: SyncResolution[] = [
      'use_local',
      'use_external',
      'manual',
      'ignored',
    ];
    expect(resolutions).toHaveLength(4);
  });

  it('creates a CreateSyncConflictInput', () => {
    const input: CreateSyncConflictInput = {
      productId: 'prod-1',
      type: 'price_mismatch',
      detectedAt: new Date(),
      localState: { quantity: 5, price: 3000, name: 'Vase' },
      externalState: { quantity: 5, price: 2800, name: 'Vase', system: 'etsy' },
    };
    expect(input.type).toBe('price_mismatch');
    expect(input.externalState.system).toBe('etsy');
  });

  it('creates a ResolveSyncConflictInput', () => {
    const input: ResolveSyncConflictInput = {
      conflictId: 'conflict-1',
      resolution: 'manual',
      notes: 'Manually updated both systems',
    };
    expect(input.conflictId).toBe('conflict-1');
    expect(input.resolution).toBe('manual');
  });

  it('creates a ResolveSyncConflictInput without optional notes', () => {
    const input: ResolveSyncConflictInput = {
      conflictId: 'conflict-1',
      resolution: 'use_external',
    };
    expect(input.notes).toBeUndefined();
  });

  it('creates a SyncConflictSummary', () => {
    const summary: SyncConflictSummary = {
      pending: 3,
      resolved: 10,
      ignored: 2,
      byType: {
        quantity_mismatch: 5,
        price_mismatch: 3,
        missing_local: 2,
        missing_external: 4,
        unexpected_sale: 1,
      },
      bySystem: {
        etsy: 8,
        square: 7,
      },
    };
    expect(summary.pending).toBe(3);
    expect(summary.byType.quantity_mismatch).toBe(5);
    expect(summary.bySystem.etsy).toBe(8);
  });

  it('module is defined', () => {
    expect(syncConflictModule).toBeDefined();
  });
});
