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
          get: async (ref: { id: string }) => ({
            data: () => mocks.freshData.get(ref.id),
          }),
          update: mocks.txnUpdate,
        };
        return cb(txn);
      },
    };
  },
}));

import { releaseStaleRegistrationHolds } from './release-stale-registration-holds';

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
