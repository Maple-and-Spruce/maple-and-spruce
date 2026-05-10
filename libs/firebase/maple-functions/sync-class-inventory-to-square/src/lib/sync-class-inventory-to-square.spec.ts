import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Class } from '@maple/ts/domain';

/**
 * Tests for sync-class-inventory-to-square.ts
 *
 * Verifies that registration writes mirror remaining-seat counts onto the
 * Square variation, with the same count-relevance guard as
 * sync-registration-count to avoid trigger churn.
 */

const mocks = vi.hoisted(() => ({
  classFindById: vi.fn(),
  countByClassId: vi.fn(),
  setQuantity: vi.fn(),
  locationId: 'mock-location',
}));

vi.mock('@maple/firebase/database', () => ({
  ClassRepository: { findById: mocks.classFindById },
  RegistrationRepository: { countByClassId: mocks.countByClassId },
}));

vi.mock('@maple/firebase/square', () => ({
  Square: class MockSquare {
    inventoryService = { setQuantity: mocks.setQuantity };
    locationId = mocks.locationId;
  },
  SQUARE_SECRET_NAMES: ['SQUARE_ACCESS_TOKEN'],
  SQUARE_STRING_NAMES: ['SQUARE_LOCATION_ID'],
}));

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: vi.fn((_config, handler) => handler),
}));

vi.mock('firebase-functions/params', () => ({
  defineSecret: vi.fn((name: string) => ({ name, value: () => `mock-${name}` })),
  defineString: vi.fn((name: string) => ({ name, value: () => `mock-${name}` })),
}));

import { syncClassInventoryToSquare } from './sync-class-inventory-to-square';

const handler = syncClassInventoryToSquare as unknown as (
  event: unknown
) => Promise<void>;

function makeSnapshot(
  exists: boolean,
  data?: Record<string, unknown>
): unknown {
  return { exists, data: () => (exists ? data : undefined) };
}

function makeClass(overrides: Partial<Class> = {}): Class {
  return {
    id: 'class-001',
    name: 'X',
    description: '',
    sessions: [{ dateTime: new Date('2026-06-01T10:00:00Z') }],
    durationMinutes: 60,
    capacity: 10,
    priceCents: 1000,
    skillLevel: 'all-levels',
    status: 'published',
    squareCatalogItemId: 'SQ-ITEM-1',
    squareVariationId: 'SQ-VAR-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('syncClassInventoryToSquare', () => {
  it('mirrors remaining seats to Square on registration create', async () => {
    mocks.classFindById.mockResolvedValue(makeClass());
    mocks.countByClassId.mockResolvedValue(3);

    const after = makeSnapshot(true, {
      classId: 'class-001',
      status: 'pending',
      quantity: 1,
    });

    await handler({
      params: { registrationId: 'reg-1' },
      data: { before: makeSnapshot(false), after },
    });

    expect(mocks.setQuantity).toHaveBeenCalledWith({
      squareVariationId: 'SQ-VAR-1',
      locationId: 'mock-location',
      quantity: 7,
    });
  });

  it('skips writes that did not change classId/status/quantity', async () => {
    const same = makeSnapshot(true, {
      classId: 'class-001',
      status: 'confirmed',
      quantity: 2,
      // unrelated change to a non-count-relevant field would still hit
      // this branch — the guard ignores everything outside the COUNT
      // relevant set.
    });

    await handler({
      params: { registrationId: 'reg-x' },
      data: { before: same, after: same },
    });

    expect(mocks.classFindById).not.toHaveBeenCalled();
    expect(mocks.setQuantity).not.toHaveBeenCalled();
  });

  it('skips classes that are not yet mirrored to Square', async () => {
    mocks.classFindById.mockResolvedValue(
      makeClass({ squareVariationId: undefined })
    );

    await handler({
      params: { registrationId: 'reg-2' },
      data: {
        before: makeSnapshot(false),
        after: makeSnapshot(true, {
          classId: 'class-001',
          status: 'pending',
          quantity: 1,
        }),
      },
    });

    expect(mocks.setQuantity).not.toHaveBeenCalled();
  });

  it('clamps quantity at zero (oversold safety net)', async () => {
    mocks.classFindById.mockResolvedValue(makeClass({ capacity: 5 }));
    mocks.countByClassId.mockResolvedValue(8);

    await handler({
      params: { registrationId: 'reg-3' },
      data: {
        before: makeSnapshot(false),
        after: makeSnapshot(true, {
          classId: 'class-001',
          status: 'pending',
          quantity: 1,
        }),
      },
    });

    expect(mocks.setQuantity).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 0 })
    );
  });
});
