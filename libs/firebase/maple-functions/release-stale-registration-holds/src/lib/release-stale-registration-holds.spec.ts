import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the stale-hold reaper. It cancels only holds that are STILL
 * pending and unpaid when re-read inside a transaction, so a payment that
 * confirms the registration between the query and the write is never clobbered.
 */

const mocks = vi.hoisted(() => ({
  onSchedule: vi.fn(),
  get: vi.fn(),
  txnUpdate: vi.fn(),
  // Per-ref state returned by the transactional re-read (txn.get).
  freshData: new Map<string, Record<string, unknown> | undefined>(),
  // Wrap a value as a Firestore-snapshot-like { data() }. Defined here (not
  // inline in the mock) to keep the mock's arrow nesting shallow.
  snap: (value: Record<string, unknown> | undefined) => ({
    data: () => value,
  }),
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
      where: () => query,
      limit: () => query,
      get: mocks.get,
    };
    return {
      collection: () => query,
      runTransaction: async (
        cb: (txn: {
          get: (ref: { id: string }) => Promise<{
            data: () => Record<string, unknown> | undefined;
          }>;
          update: (ref: unknown, data: unknown) => void;
        }) => Promise<unknown>
      ) => {
        const txn = {
          get: async (ref: { id: string }) =>
            mocks.snap(mocks.freshData.get(ref.id)),
          update: mocks.txnUpdate,
        };
        return cb(txn);
      },
    };
  },
}));

import { getDb } from '@maple/firebase/database';
import {
  releaseStaleHolds,
  releaseStaleRegistrationHolds,
} from './release-stale-registration-holds';

const handler = releaseStaleRegistrationHolds as unknown as () => Promise<void>;

/** A query-result doc — only its ref matters; the handler re-reads via txn.get. */
function queryDoc(id: string) {
  return { ref: { id } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.freshData.clear();
});

describe('releaseStaleRegistrationHolds', () => {
  it('cancels a stale pending hold that is still pending + unpaid on re-read', async () => {
    mocks.get.mockResolvedValue({
      empty: false,
      size: 1,
      docs: [queryDoc('reg-1')],
    });
    mocks.freshData.set('reg-1', { status: 'pending' });

    await handler();

    expect(mocks.txnUpdate).toHaveBeenCalledWith(
      { id: 'reg-1' },
      expect.objectContaining({ status: 'cancelled' })
    );
    // Reason goes in its own field, NOT notes (preserve the buyer's note).
    const updateArg = mocks.txnUpdate.mock.calls[0][1];
    expect(updateArg).not.toHaveProperty('notes');
    expect(updateArg).toHaveProperty('holdReleaseReason');
  });

  it('does NOT cancel a hold the webhook confirmed after the query (race)', async () => {
    // Query snapshot saw it as pending, but the transactional re-read finds it
    // already confirmed + paid — must not clobber it.
    mocks.get.mockResolvedValue({
      empty: false,
      size: 1,
      docs: [queryDoc('reg-race')],
    });
    mocks.freshData.set('reg-race', {
      status: 'confirmed',
      squarePaymentId: 'PAY-1',
    });

    await handler();

    expect(mocks.txnUpdate).not.toHaveBeenCalled();
  });

  it('does NOT cancel a hold that has a squarePaymentId on re-read', async () => {
    mocks.get.mockResolvedValue({
      empty: false,
      size: 1,
      docs: [queryDoc('reg-2')],
    });
    mocks.freshData.set('reg-2', {
      status: 'pending',
      squarePaymentId: 'PAY-9',
    });

    await handler();

    expect(mocks.txnUpdate).not.toHaveBeenCalled();
  });

  it('no-ops when there are no stale holds', async () => {
    mocks.get.mockResolvedValue({ empty: true, size: 0, docs: [] });

    await handler();

    expect(mocks.txnUpdate).not.toHaveBeenCalled();
  });
});

describe('releaseStaleHolds (the hand-run path, used in dev)', () => {
  it('reports what it found and released, so the tool can say so', async () => {
    mocks.get.mockResolvedValue({
      empty: false,
      size: 2,
      docs: [queryDoc('reg-stale'), queryDoc('reg-paid')],
    });
    mocks.freshData.set('reg-stale', { status: 'pending' });
    mocks.freshData.set('reg-paid', { status: 'pending', squarePaymentId: 'PAY-2' });

    const result = await releaseStaleHolds(getDb(), new Date('2026-10-13T12:00:00Z'));

    expect(result).toEqual({ found: 2, released: 1 });
    expect(mocks.txnUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.txnUpdate).toHaveBeenCalledWith(
      { id: 'reg-stale' },
      expect.objectContaining({ status: 'cancelled' })
    );
  });

  it('reports zero when nothing is stale', async () => {
    mocks.get.mockResolvedValue({ empty: true, size: 0, docs: [] });

    await expect(releaseStaleHolds(getDb())).resolves.toEqual({ found: 0, released: 0 });
  });
});
