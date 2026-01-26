import type { SyncConflict, SyncConflictSummary } from '@maple/ts/domain';

/**
 * Mock sync conflict data for Storybook stories
 */

// Quantity mismatch - local has more than Square
export const mockQuantityMismatchConflict: SyncConflict = {
  id: 'conflict-001',
  productId: 'prod-001',
  type: 'quantity_mismatch',
  detectedAt: new Date('2026-01-25T10:00:00Z'),
  localState: {
    quantity: 5,
    price: 4500,
    name: 'Hand-thrown Ceramic Vase',
  },
  externalState: {
    system: 'square',
    quantity: 3,
    price: 4500,
    name: 'Hand-thrown Ceramic Vase',
  },
  status: 'pending',
};

// Price mismatch - Square has different price
export const mockPriceMismatchConflict: SyncConflict = {
  id: 'conflict-002',
  productId: 'prod-002',
  type: 'price_mismatch',
  detectedAt: new Date('2026-01-24T14:30:00Z'),
  localState: {
    quantity: 2,
    price: 4500,
    name: 'Wool Scarf',
  },
  externalState: {
    system: 'square',
    quantity: 2,
    price: 5000,
    name: 'Wool Scarf',
  },
  status: 'pending',
};

// Missing in external system
export const mockMissingExternalConflict: SyncConflict = {
  id: 'conflict-003',
  productId: 'prod-003',
  type: 'missing_external',
  detectedAt: new Date('2026-01-23T09:15:00Z'),
  localState: {
    quantity: 8,
    price: 3500,
    name: 'Handmade Leather Wallet',
  },
  externalState: {
    system: 'square',
    quantity: 0,
    price: 0,
    name: '(deleted from Square)',
  },
  status: 'pending',
};

// Missing locally - exists in Square but not tracked
export const mockMissingLocalConflict: SyncConflict = {
  id: 'conflict-004',
  productId: 'sq-untracked-item-123',
  type: 'missing_local',
  detectedAt: new Date('2026-01-22T16:45:00Z'),
  localState: {
    quantity: 0,
    price: 0,
    name: '(not in Firestore)',
  },
  externalState: {
    system: 'square',
    quantity: 10,
    price: 2500,
    name: 'New Square Item',
  },
  status: 'pending',
};

// Resolved conflict - used local
export const mockResolvedUseLocalConflict: SyncConflict = {
  id: 'conflict-005',
  productId: 'prod-004',
  type: 'quantity_mismatch',
  detectedAt: new Date('2026-01-20T11:00:00Z'),
  localState: {
    quantity: 12,
    price: 6000,
    name: 'Ceramic Bowl Set',
  },
  externalState: {
    system: 'square',
    quantity: 10,
    price: 6000,
    name: 'Ceramic Bowl Set',
  },
  status: 'resolved',
  resolution: 'use_local',
  resolvedAt: new Date('2026-01-20T11:30:00Z'),
  resolvedBy: 'admin-user-123',
};

// Resolved conflict - used external
export const mockResolvedUseExternalConflict: SyncConflict = {
  id: 'conflict-006',
  productId: 'prod-005',
  type: 'price_mismatch',
  detectedAt: new Date('2026-01-19T08:00:00Z'),
  localState: {
    quantity: 4,
    price: 7500,
    name: 'Silver Ring',
  },
  externalState: {
    system: 'square',
    quantity: 4,
    price: 8000,
    name: 'Silver Ring',
  },
  status: 'resolved',
  resolution: 'use_external',
  resolvedAt: new Date('2026-01-19T09:15:00Z'),
  resolvedBy: 'admin-user-456',
};

// Ignored conflict
export const mockIgnoredConflict: SyncConflict = {
  id: 'conflict-007',
  productId: 'prod-006',
  type: 'price_mismatch',
  detectedAt: new Date('2026-01-18T14:00:00Z'),
  localState: {
    quantity: 1,
    price: 15000,
    name: 'Custom Commissioned Piece',
  },
  externalState: {
    system: 'square',
    quantity: 1,
    price: 12000,
    name: 'Custom Commissioned Piece',
  },
  status: 'resolved',
  resolution: 'ignored',
  resolvedAt: new Date('2026-01-18T14:30:00Z'),
  resolvedBy: 'admin-user-123',
  notes: 'Intentional price difference - custom piece has higher local price for tracking artist commission',
};

// Manually resolved conflict
export const mockManuallyResolvedConflict: SyncConflict = {
  id: 'conflict-008',
  productId: 'prod-007',
  type: 'quantity_mismatch',
  detectedAt: new Date('2026-01-17T10:00:00Z'),
  localState: {
    quantity: 3,
    price: 5500,
    name: 'Woven Basket',
  },
  externalState: {
    system: 'square',
    quantity: 5,
    price: 5500,
    name: 'Woven Basket',
  },
  status: 'resolved',
  resolution: 'manual',
  resolvedAt: new Date('2026-01-17T11:00:00Z'),
  resolvedBy: 'admin-user-789',
  notes: 'Counted physical inventory - actual count is 4. Updated both systems manually.',
};

// All conflicts array
export const mockSyncConflicts: SyncConflict[] = [
  mockQuantityMismatchConflict,
  mockPriceMismatchConflict,
  mockMissingExternalConflict,
  mockMissingLocalConflict,
  mockResolvedUseLocalConflict,
  mockResolvedUseExternalConflict,
  mockIgnoredConflict,
  mockManuallyResolvedConflict,
];

// Only pending conflicts
export const mockPendingConflicts: SyncConflict[] = mockSyncConflicts.filter(
  (c) => c.status === 'pending'
);

// Only resolved conflicts (including ignored)
export const mockResolvedConflicts: SyncConflict[] = mockSyncConflicts.filter(
  (c) => c.status === 'resolved'
);

// Summary for nav badge and dashboard
export const mockSyncConflictSummary: SyncConflictSummary = {
  pending: 4,
  resolved: 3,
  ignored: 1,
  byType: {
    quantity_mismatch: 2,
    price_mismatch: 1,
    missing_local: 1,
    missing_external: 0,
    unexpected_sale: 0,
  },
  bySystem: {
    square: 4,
    etsy: 0,
  },
};

// Empty summary for no conflicts state
export const mockEmptySyncConflictSummary: SyncConflictSummary = {
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
