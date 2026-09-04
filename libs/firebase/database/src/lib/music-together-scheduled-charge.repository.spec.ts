import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  txGet: vi.fn(),
  txUpdate: vi.fn(),
  docGet: vi.fn(),
}));

const docRef = { id: 'chg-1' };

vi.mock('./utilities/database.config', () => ({
  getDb: () => ({
    collection: () => ({ doc: () => ({ ...docRef, get: mocks.docGet }) }),
    runTransaction: async (
      fn: (tx: {
        get: (ref: unknown) => Promise<unknown>;
        update: (ref: unknown, data: unknown) => void;
      }) => Promise<boolean>
    ) => fn({ get: mocks.txGet, update: mocks.txUpdate }),
  }),
  db: {},
  toDate: (value: unknown): Date =>
    value instanceof Date ? value : new Date(value as string),
}));

import { MusicTogetherScheduledChargeRepository } from './music-together-scheduled-charge.repository';

/** A stored charge doc as Firestore hands it back. */
function chargeDoc(overrides: Record<string, unknown> = {}) {
  return {
    registrationId: 'reg-1',
    sectionId: 'sec-1',
    installmentNumber: 2,
    amountCents: 13200,
    dueAt: new Date('2030-10-08T14:00:00Z'),
    status: 'scheduled',
    idempotencyKey: 'mt-charge-chg-1',
    createdAt: new Date('2030-01-01T00:00:00Z'),
    updatedAt: new Date('2030-01-01T00:00:00Z'),
    ...overrides,
  };
}

const snap = (data: Record<string, unknown> | null) => ({
  exists: data !== null,
  id: 'chg-1',
  data: () => data ?? undefined,
});

/**
 * `tryWaive` is the transactional half of the comped-installment feature
 * (#791). Its whole job is to be un-raceable against the charge job: the
 * status check and the write share one transaction, exactly like
 * `tryClaimLease`. These tests pin that, because a waive that lands on an
 * already-`charging` doc would either double-charge a family or silently
 * cancel a payment that had already left their account.
 */
describe('MusicTogetherScheduledChargeRepository.tryWaive', () => {
  beforeEach(() => vi.clearAllMocks());

  it('flips scheduled → waived and records who and why', async () => {
    mocks.txGet.mockResolvedValue(snap(chargeDoc()));
    mocks.docGet.mockResolvedValue(
      snap(chargeDoc({ status: 'waived', waivedReason: 'Pilot half-off' }))
    );

    const result = await MusicTogetherScheduledChargeRepository.tryWaive(
      'chg-1',
      'Pilot half-off',
      'admin-uid'
    );

    expect(mocks.txUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'waived',
        waivedReason: 'Pilot half-off',
        waivedByUid: 'admin-uid',
        resolvedAt: expect.any(Date),
      })
    );
    expect(result?.status).toBe('waived');
    expect(result?.waivedReason).toBe('Pilot half-off');
  });

  it.each(['charging', 'paid', 'failed', 'cancelled', 'waived'])(
    'refuses to waive a %s charge — and writes nothing',
    async (status) => {
      mocks.txGet.mockResolvedValue(snap(chargeDoc({ status })));

      const result = await MusicTogetherScheduledChargeRepository.tryWaive(
        'chg-1',
        'reason',
        'admin-uid'
      );

      expect(result).toBeUndefined();
      expect(mocks.txUpdate).not.toHaveBeenCalled();
    }
  );

  it('refuses a missing charge', async () => {
    mocks.txGet.mockResolvedValue(snap(null));

    const result = await MusicTogetherScheduledChargeRepository.tryWaive(
      'chg-1',
      'reason',
      'admin-uid'
    );

    expect(result).toBeUndefined();
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it('reads the status INSIDE the transaction, not before it', async () => {
    // If the check happened outside, a charge claimed by the charge job
    // between read and write could still be waived.
    mocks.txGet.mockResolvedValue(snap(chargeDoc()));
    mocks.docGet.mockResolvedValue(snap(chargeDoc({ status: 'waived' })));

    await MusicTogetherScheduledChargeRepository.tryWaive(
      'chg-1',
      'reason',
      'admin-uid'
    );

    expect(mocks.txGet).toHaveBeenCalledTimes(1);
  });
});

describe('MusicTogetherScheduledChargeRepository — waived round-trip', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads back waivedReason / waivedByUid', async () => {
    mocks.txGet.mockResolvedValue(snap(chargeDoc()));
    mocks.docGet.mockResolvedValue(
      snap(
        chargeDoc({
          status: 'waived',
          waivedReason: 'Pilot semester half-off',
          waivedByUid: 'stephanie-uid',
        })
      )
    );

    const result = await MusicTogetherScheduledChargeRepository.tryWaive(
      'chg-1',
      'Pilot semester half-off',
      'stephanie-uid'
    );

    expect(result).toMatchObject({
      status: 'waived',
      waivedReason: 'Pilot semester half-off',
      waivedByUid: 'stephanie-uid',
    });
  });
});
