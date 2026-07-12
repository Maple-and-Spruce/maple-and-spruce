import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Class } from '@maple/ts/domain';

/**
 * Tests for sync-class-to-square.ts
 *
 * Covers the four lifecycle branches of the trigger:
 *  - Published create  → creates Square catalog item + seeds inventory
 *  - Published update  → updates name/price; resets inventory on capacity change
 *  - Unpublished       → deletes catalog item + clears back-refs
 *  - Deleted           → deletes catalog item if it existed
 *
 * Plus the Square-relevant change guard (skip writes that touch nothing
 * material — prevents the trigger feedback loop with `updateSquareSyncIds`).
 */

const mocks = vi.hoisted(() => ({
  classFindById: vi.fn(),
  registrationCountByClassId: vi.fn(),
  updateSquareSyncIds: vi.fn(),
  clearSquareSyncIds: vi.fn(),
  // Square service mocks
  createClassCatalogItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  setQuantity: vi.fn(),
  locationId: 'mock-location',
}));

vi.mock('@maple/firebase/database', () => ({
  ClassRepository: {
    findById: mocks.classFindById,
    updateSquareSyncIds: mocks.updateSquareSyncIds,
    clearSquareSyncIds: mocks.clearSquareSyncIds,
  },
  RegistrationRepository: {
    countByClassId: mocks.registrationCountByClassId,
  },
}));

vi.mock('@maple/firebase/square', () => {
  return {
    Square: class MockSquare {
      catalogService = {
        createClassCatalogItem: mocks.createClassCatalogItem,
        updateItem: mocks.updateItem,
        deleteItem: mocks.deleteItem,
      };
      inventoryService = { setQuantity: mocks.setQuantity };
      locationId = mocks.locationId;
    },
    SQUARE_SECRET_NAMES: ['SQUARE_ACCESS_TOKEN'],
    SQUARE_STRING_NAMES: ['SQUARE_LOCATION_ID'],
  };
});

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: vi.fn((_config, handler) => handler),
}));

vi.mock('firebase-functions/params', () => ({
  defineSecret: vi.fn((name: string) => ({ name, value: () => `mock-${name}` })),
  defineString: vi.fn((name: string) => ({ name, value: () => `mock-${name}` })),
}));

import { syncClassToSquare } from './sync-class-to-square';

const handler = syncClassToSquare as unknown as (
  event: unknown
) => Promise<void>;

function makeSnapshot(exists: boolean, data?: Record<string, unknown>): unknown {
  return {
    id: (data?.['id'] as string | undefined) ?? 'class-001',
    exists,
    data: () => (exists ? data : undefined),
  };
}

function makeClassData(overrides: Partial<Class> = {}): Record<string, unknown> {
  const base: Class = {
    id: 'class-001',
    name: 'Intro to Pottery',
    description: 'Learn pottery basics',
    sessions: [{ dateTime: new Date('2026-05-15T14:00:00Z') }],
    durationMinutes: 120,
    capacity: 10,
    priceCents: 4500,
    skillLevel: 'beginner',
    status: 'published',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  return { ...base } as unknown as Record<string, unknown>;
}

function makeEvent(beforeData: unknown, afterData: unknown) {
  return {
    params: { classId: 'class-001' },
    data: {
      before: beforeData,
      after: afterData,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.registrationCountByClassId.mockResolvedValue(0);
});

describe('syncClassToSquare — published create', () => {
  it('creates the Square catalog item, stores the IDs, and seeds inventory', async () => {
    mocks.createClassCatalogItem.mockResolvedValue({
      squareItemId: 'SQ-ITEM-1',
      squareVariationId: 'SQ-VAR-1',
      squareModifierListId: 'SQ-MOD-1',
      squareCatalogVersion: 1,
    });

    const before = makeSnapshot(false);
    const after = makeSnapshot(true, makeClassData({ capacity: 8 }));

    await handler(makeEvent(before, after));

    expect(mocks.createClassCatalogItem).toHaveBeenCalledWith(
      expect.objectContaining({
        classId: 'class-001',
        name: 'Intro to Pottery',
        priceCents: 4500,
      })
    );
    expect(mocks.updateSquareSyncIds).toHaveBeenCalledWith('class-001', {
      squareCatalogItemId: 'SQ-ITEM-1',
      squareVariationId: 'SQ-VAR-1',
      squareModifierListId: 'SQ-MOD-1',
      squareCatalogVersion: 1,
    });
    expect(mocks.setQuantity).toHaveBeenCalledWith({
      squareVariationId: 'SQ-VAR-1',
      locationId: 'mock-location',
      quantity: 8,
    });
  });

  it('seeds inventory at (capacity - existingRegistrationCount)', async () => {
    mocks.createClassCatalogItem.mockResolvedValue({
      squareItemId: 'I',
      squareVariationId: 'V',
      squareModifierListId: 'M',
      squareCatalogVersion: 1,
    });
    mocks.registrationCountByClassId.mockResolvedValue(3);

    const before = makeSnapshot(false);
    const after = makeSnapshot(true, makeClassData({ capacity: 10 }));

    await handler(makeEvent(before, after));

    expect(mocks.setQuantity).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 7 })
    );
  });

  it('skips inventory seeding when remaining capacity is zero', async () => {
    mocks.createClassCatalogItem.mockResolvedValue({
      squareItemId: 'I',
      squareVariationId: 'V',
      squareModifierListId: 'M',
      squareCatalogVersion: 1,
    });
    mocks.registrationCountByClassId.mockResolvedValue(10);

    const before = makeSnapshot(false);
    const after = makeSnapshot(true, makeClassData({ capacity: 10 }));

    await handler(makeEvent(before, after));

    expect(mocks.setQuantity).not.toHaveBeenCalled();
  });
});

describe('syncClassToSquare — published update on existing mirror', () => {
  it('updates name and price when changed and persists the new catalog version', async () => {
    mocks.updateItem.mockResolvedValue({ squareCatalogVersion: 5 });

    const before = makeSnapshot(
      true,
      makeClassData({
        name: 'Old Name',
        priceCents: 4000,
        squareCatalogItemId: 'SQ-ITEM-1',
        squareVariationId: 'SQ-VAR-1',
        squareCatalogVersion: 4,
      })
    );
    const after = makeSnapshot(
      true,
      makeClassData({
        name: 'New Name',
        priceCents: 5000,
        squareCatalogItemId: 'SQ-ITEM-1',
        squareVariationId: 'SQ-VAR-1',
        squareCatalogVersion: 4,
      })
    );

    await handler(makeEvent(before, after));

    expect(mocks.updateItem).toHaveBeenCalledWith(
      expect.objectContaining({
        squareItemId: 'SQ-ITEM-1',
        name: 'New Name',
        variations: [
          { squareVariationId: 'SQ-VAR-1', priceCents: 5000 },
        ],
      })
    );
    expect(mocks.updateSquareSyncIds).toHaveBeenCalledWith('class-001', {
      squareCatalogVersion: 5,
    });
    // No catalog create when mirror already exists
    expect(mocks.createClassCatalogItem).not.toHaveBeenCalled();
  });

  it('resets Square inventory when capacity changes', async () => {
    mocks.registrationCountByClassId.mockResolvedValue(2);

    const before = makeSnapshot(
      true,
      makeClassData({
        capacity: 8,
        squareCatalogItemId: 'I',
        squareVariationId: 'V',
        squareCatalogVersion: 1,
      })
    );
    const after = makeSnapshot(
      true,
      makeClassData({
        capacity: 12,
        squareCatalogItemId: 'I',
        squareVariationId: 'V',
        squareCatalogVersion: 1,
      })
    );

    await handler(makeEvent(before, after));

    expect(mocks.setQuantity).toHaveBeenCalledWith({
      squareVariationId: 'V',
      locationId: 'mock-location',
      quantity: 10, // 12 - 2
    });
  });

  it('skips writes that change no Square-relevant field (feedback-loop guard)', async () => {
    const data = makeClassData({
      squareCatalogItemId: 'I',
      squareVariationId: 'V',
    });
    const before = makeSnapshot(true, data);
    const after = makeSnapshot(true, data); // identical — only updatedAt-style write

    await handler(makeEvent(before, after));

    expect(mocks.createClassCatalogItem).not.toHaveBeenCalled();
    expect(mocks.updateItem).not.toHaveBeenCalled();
    expect(mocks.setQuantity).not.toHaveBeenCalled();
  });
});

describe('syncClassToSquare — unpublish & delete', () => {
  it('deletes the Square catalog item and clears back-refs when class is unpublished', async () => {
    const before = makeSnapshot(
      true,
      makeClassData({
        status: 'published',
        squareCatalogItemId: 'SQ-ITEM-1',
        squareVariationId: 'SQ-VAR-1',
      })
    );
    const after = makeSnapshot(
      true,
      makeClassData({
        status: 'cancelled',
        squareCatalogItemId: 'SQ-ITEM-1',
        squareVariationId: 'SQ-VAR-1',
      })
    );

    await handler(makeEvent(before, after));

    expect(mocks.deleteItem).toHaveBeenCalledWith('SQ-ITEM-1');
    expect(mocks.clearSquareSyncIds).toHaveBeenCalledWith('class-001');
  });

  it('deletes the Square catalog item when the class doc is deleted', async () => {
    const before = makeSnapshot(
      true,
      makeClassData({ squareCatalogItemId: 'SQ-ITEM-1' })
    );
    const after = makeSnapshot(false);

    await handler(makeEvent(before, after));

    expect(mocks.deleteItem).toHaveBeenCalledWith('SQ-ITEM-1');
  });

  it('is a no-op when an unpublished class never had a Square mirror', async () => {
    const before = makeSnapshot(true, makeClassData({ status: 'draft' }));
    const after = makeSnapshot(true, makeClassData({ status: 'cancelled' }));

    await handler(makeEvent(before, after));

    expect(mocks.deleteItem).not.toHaveBeenCalled();
    expect(mocks.clearSquareSyncIds).not.toHaveBeenCalled();
  });
});
