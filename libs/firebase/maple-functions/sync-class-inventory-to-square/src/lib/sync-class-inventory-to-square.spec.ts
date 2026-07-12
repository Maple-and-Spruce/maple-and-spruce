import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for sync-class-inventory-to-square.ts
 *
 * The trigger recomputes the class registration count on any count-relevant
 * registrations/{id} write and PHYSICAL_COUNTs the class's Square variation
 * to (capacity - count). Covers:
 *  - count-relevant create → sets inventory to (capacity - count)
 *  - non-count-relevant update (only squarePaymentId/updatedAt) → no Square call
 *  - delete (cancel) → recomputes higher remaining
 *  - class with no squareVariationId → skip
 *  - class not found → skip
 *  - oversold clamp (count > capacity) → quantity clamped to 0
 *  - Square API throws → error swallowed, no rethrow
 */

const mocks = vi.hoisted(() => ({
  classFindById: vi.fn(),
  registrationCountByClassId: vi.fn(),
  setQuantity: vi.fn(),
  locationId: 'mock-location',
}));

vi.mock('@maple/firebase/database', () => ({
  ClassRepository: {
    findById: mocks.classFindById,
  },
  RegistrationRepository: {
    countByClassId: mocks.registrationCountByClassId,
  },
}));

vi.mock('@maple/firebase/square', () => {
  return {
    Square: class MockSquare {
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

import { syncClassInventoryToSquare } from './sync-class-inventory-to-square';

const handler = syncClassInventoryToSquare as unknown as (
  event: unknown
) => Promise<void>;

function makeSnapshot(exists: boolean, data?: Record<string, unknown>): unknown {
  return {
    id: (data?.['id'] as string | undefined) ?? 'reg-001',
    exists,
    data: () => (exists ? data : undefined),
  };
}

function makeRegistrationData(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    classId: 'class-001',
    status: 'confirmed',
    quantity: 1,
    ...overrides,
  };
}

function makeClass(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: 'class-001',
    name: 'Intro to Pottery',
    capacity: 10,
    squareVariationId: 'SQ-VAR-1',
    ...overrides,
  };
}

function makeEvent(beforeData: unknown, afterData: unknown) {
  return {
    params: { registrationId: 'reg-001' },
    data: {
      before: beforeData,
      after: afterData,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.classFindById.mockResolvedValue(makeClass());
  mocks.registrationCountByClassId.mockResolvedValue(0);
});

describe('syncClassInventoryToSquare — count-relevant create', () => {
  it('sets Square inventory to (capacity - registrationCount)', async () => {
    mocks.registrationCountByClassId.mockResolvedValue(3);

    const before = makeSnapshot(false);
    const after = makeSnapshot(true, makeRegistrationData());

    await handler(makeEvent(before, after));

    expect(mocks.classFindById).toHaveBeenCalledWith('class-001');
    expect(mocks.setQuantity).toHaveBeenCalledWith({
      squareVariationId: 'SQ-VAR-1',
      locationId: 'mock-location',
      quantity: 7, // 10 - 3
    });
  });
});

describe('syncClassInventoryToSquare — non-count-relevant update', () => {
  it('skips Square when only squarePaymentId / updatedAt changed', async () => {
    const before = makeSnapshot(
      true,
      makeRegistrationData({ squarePaymentId: 'PAY-1', updatedAt: 'a' })
    );
    const after = makeSnapshot(
      true,
      makeRegistrationData({ squarePaymentId: 'PAY-2', updatedAt: 'b' })
    );

    await handler(makeEvent(before, after));

    expect(mocks.classFindById).not.toHaveBeenCalled();
    expect(mocks.setQuantity).not.toHaveBeenCalled();
  });
});

describe('syncClassInventoryToSquare — delete (cancel)', () => {
  it('recomputes and sets a higher remaining count', async () => {
    // After the delete only 2 active registrations remain → remaining 8.
    mocks.registrationCountByClassId.mockResolvedValue(2);

    const before = makeSnapshot(true, makeRegistrationData());
    const after = makeSnapshot(false);

    await handler(makeEvent(before, after));

    // classId sourced from the `before` snapshot when after is gone.
    expect(mocks.classFindById).toHaveBeenCalledWith('class-001');
    expect(mocks.setQuantity).toHaveBeenCalledWith({
      squareVariationId: 'SQ-VAR-1',
      locationId: 'mock-location',
      quantity: 8, // 10 - 2
    });
  });
});

describe('syncClassInventoryToSquare — skips', () => {
  it('skips when the class has no squareVariationId', async () => {
    mocks.classFindById.mockResolvedValue(
      makeClass({ squareVariationId: undefined })
    );

    const before = makeSnapshot(false);
    const after = makeSnapshot(true, makeRegistrationData());

    await handler(makeEvent(before, after));

    expect(mocks.registrationCountByClassId).not.toHaveBeenCalled();
    expect(mocks.setQuantity).not.toHaveBeenCalled();
  });

  it('skips when the class is not found', async () => {
    mocks.classFindById.mockResolvedValue(undefined);

    const before = makeSnapshot(false);
    const after = makeSnapshot(true, makeRegistrationData());

    await handler(makeEvent(before, after));

    expect(mocks.registrationCountByClassId).not.toHaveBeenCalled();
    expect(mocks.setQuantity).not.toHaveBeenCalled();
  });
});

describe('syncClassInventoryToSquare — oversold clamp', () => {
  it('clamps quantity to 0 when count exceeds capacity', async () => {
    mocks.classFindById.mockResolvedValue(makeClass({ capacity: 5 }));
    mocks.registrationCountByClassId.mockResolvedValue(8);

    const before = makeSnapshot(false);
    const after = makeSnapshot(true, makeRegistrationData());

    await handler(makeEvent(before, after));

    expect(mocks.setQuantity).toHaveBeenCalledWith({
      squareVariationId: 'SQ-VAR-1',
      locationId: 'mock-location',
      quantity: 0, // Math.max(5 - 8, 0)
    });
  });
});

describe('syncClassInventoryToSquare — Square API error', () => {
  it('swallows Square errors and does not reject', async () => {
    mocks.setQuantity.mockRejectedValue(new Error('Square down'));

    const before = makeSnapshot(false);
    const after = makeSnapshot(true, makeRegistrationData());

    await expect(handler(makeEvent(before, after))).resolves.toBeUndefined();
    expect(mocks.setQuantity).toHaveBeenCalled();
  });
});
