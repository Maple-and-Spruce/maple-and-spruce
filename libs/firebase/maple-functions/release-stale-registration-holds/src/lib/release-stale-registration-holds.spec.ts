import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the stale-hold reaper. Verifies it cancels only `pending`
 * registrations old enough and without a payment, and leaves ones mid-confirm
 * (with a squarePaymentId) alone.
 */

const mocks = vi.hoisted(() => ({
  onSchedule: vi.fn(),
  get: vi.fn(),
  batchUpdate: vi.fn(),
  batchCommit: vi.fn(),
  where: vi.fn(),
}));

vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: vi.fn((config, handler) => {
    mocks.onSchedule(config, handler);
    return handler;
  }),
}));

vi.mock('@maple/firebase/database', () => ({
  getDb: () => {
    const query = {
      where: vi.fn(() => query),
      get: mocks.get,
    };
    return {
      collection: vi.fn(() => query),
      batch: vi.fn(() => ({
        update: mocks.batchUpdate,
        commit: mocks.batchCommit,
      })),
    };
  },
}));

import { releaseStaleRegistrationHolds } from './release-stale-registration-holds';

const handler = releaseStaleRegistrationHolds as unknown as () => Promise<void>;

function doc(id: string, data: Record<string, unknown>) {
  return { ref: { id }, data: () => data };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('releaseStaleRegistrationHolds', () => {
  it('cancels a stale pending hold with no payment', async () => {
    mocks.get.mockResolvedValue({
      empty: false,
      size: 1,
      docs: [doc('reg-1', { status: 'pending' })],
    });

    await handler();

    expect(mocks.batchUpdate).toHaveBeenCalledWith(
      { id: 'reg-1' },
      expect.objectContaining({ status: 'cancelled' })
    );
    expect(mocks.batchCommit).toHaveBeenCalled();
  });

  it('leaves a pending hold that already has a squarePaymentId (confirming race)', async () => {
    mocks.get.mockResolvedValue({
      empty: false,
      size: 1,
      docs: [doc('reg-2', { status: 'pending', squarePaymentId: 'PAY-9' })],
    });

    await handler();

    expect(mocks.batchUpdate).not.toHaveBeenCalled();
    expect(mocks.batchCommit).not.toHaveBeenCalled();
  });

  it('no-ops when there are no stale holds', async () => {
    mocks.get.mockResolvedValue({ empty: true, size: 0, docs: [] });

    await handler();

    expect(mocks.batchUpdate).not.toHaveBeenCalled();
    expect(mocks.batchCommit).not.toHaveBeenCalled();
  });
});
