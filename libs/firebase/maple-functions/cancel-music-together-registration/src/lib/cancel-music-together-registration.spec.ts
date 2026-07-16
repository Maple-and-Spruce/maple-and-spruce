import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  capturedHandler: null as
    | ((d: unknown, c: unknown, s: unknown, st: unknown) => Promise<unknown>)
    | null,
  regFindById: vi.fn(),
  regUpdate: vi.fn(),
  sectionFindById: vi.fn(),
  chargesByReg: vi.fn(),
  chargeUpdate: vi.fn(),
  refundPayment: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => {
  class HttpsError extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  }
  const endpoint = {
    usingSecrets: vi.fn(() => endpoint),
    usingStrings: vi.fn(() => endpoint),
    requiringRole: vi.fn(() => endpoint),
    handle: vi.fn((h: typeof mocks.capturedHandler) => {
      mocks.capturedHandler = h;
      return 'mock-fn';
    }),
  };
  return {
    Functions: { endpoint },
    Role: { Admin: 'admin' },
    throwInvalidArgument: (m: string) => {
      throw new HttpsError('invalid-argument', m);
    },
    throwNotFound: (e: string, id: string) => {
      throw new HttpsError('not-found', `${e} not found: ${id}`);
    },
    throwFailedPrecondition: (m: string) => {
      throw new HttpsError('failed-precondition', m);
    },
  };
});

vi.mock('@maple/firebase/square', () => ({
  MT_SQUARE_SECRET_NAMES: ['MT_SQUARE_ACCESS_TOKEN'],
  MT_SQUARE_STRING_NAMES: ['MT_SQUARE_ENV', 'MT_SQUARE_LOCATION_ID', 'MT_SALES_TAX_RATE'],
  MT_SQUARE_KEYS: {},
  Square: class {
    paymentsService = { refundPayment: mocks.refundPayment };
  },
}));

vi.mock('@maple/firebase/database', () => ({
  MusicTogetherRegistrationRepository: {
    findById: mocks.regFindById,
    update: mocks.regUpdate,
  },
  MusicTogetherSectionRepository: { findById: mocks.sectionFindById },
  MusicTogetherScheduledChargeRepository: {
    findByRegistrationId: mocks.chargesByReg,
    update: mocks.chargeUpdate,
  },
}));

import './cancel-music-together-registration';

const SECRETS = { MT_SQUARE_ACCESS_TOKEN: 'tok' };
const STRINGS = { MT_SQUARE_ENV: 'LOCAL', MT_SQUARE_LOCATION_ID: 'MT_LOC', MT_SALES_TAX_RATE: '0.0' };
function run(data: unknown) {
  return mocks.capturedHandler!(data, {}, SECRETS, STRINGS);
}

// First class far in the future → pre-class (refundable).
const futureSection = {
  id: 'sec-1',
  sessions: [{ dateTime: new Date(Date.now() + 30 * 86_400_000) }],
};
// First class in the past → non-refundable.
const startedSection = {
  id: 'sec-1',
  sessions: [{ dateTime: new Date(Date.now() - 30 * 86_400_000) }],
};

const installmentReg = {
  id: 'reg-1',
  sectionId: 'sec-1',
  status: 'confirmed',
  pricePaidCents: 13200,
  squarePaymentId: 'pay-1',
};

describe('cancelMusicTogetherRegistration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.regFindById.mockResolvedValue(installmentReg);
    mocks.regUpdate.mockImplementation(async (i) => i);
    mocks.refundPayment.mockResolvedValue({ refundId: 'ref-1' });
    mocks.chargesByReg.mockResolvedValue([
      { id: 'chg-2', status: 'scheduled' },
    ]);
  });

  it('before first class: refunds paid amount minus $25, cancels scheduled charges, marks refunded', async () => {
    mocks.sectionFindById.mockResolvedValue(futureSection);

    const result = (await run({ registrationId: 'reg-1' })) as {
      status: string;
      refundCents: number;
      refundId?: string;
      cancelledChargeCount: number;
    };

    expect(mocks.refundPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: 'pay-1',
        amountCents: 13200 - 2500,
        idempotencyKey: 'mtrefund-reg-1', // stable
      })
    );
    expect(mocks.chargeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'chg-2', status: 'cancelled' })
    );
    expect(result.status).toBe('refunded');
    expect(result.refundCents).toBe(10700);
    expect(result.cancelledChargeCount).toBe(1);
    expect(mocks.regUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'reg-1', status: 'refunded' })
    );
  });

  it('after first class: no refund, still cancels scheduled charges, marks cancelled', async () => {
    mocks.sectionFindById.mockResolvedValue(startedSection);

    const result = (await run({ registrationId: 'reg-1' })) as {
      status: string;
      refundCents: number;
      cancelledChargeCount: number;
    };

    expect(mocks.refundPayment).not.toHaveBeenCalled();
    expect(mocks.chargeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'chg-2', status: 'cancelled' })
    );
    expect(result.status).toBe('cancelled');
    expect(result.refundCents).toBe(0);
    expect(result.cancelledChargeCount).toBe(1);
  });

  it('leaves already-paid charges alone', async () => {
    mocks.sectionFindById.mockResolvedValue(futureSection);
    mocks.chargesByReg.mockResolvedValue([
      { id: 'chg-paid', status: 'paid' },
      { id: 'chg-sched', status: 'scheduled' },
    ]);

    const result = (await run({ registrationId: 'reg-1' })) as {
      cancelledChargeCount: number;
    };

    expect(result.cancelledChargeCount).toBe(1);
    expect(mocks.chargeUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.chargeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'chg-sched' })
    );
  });

  it('404s an unknown registration', async () => {
    mocks.regFindById.mockResolvedValue(undefined);
    await expect(run({ registrationId: 'nope' })).rejects.toThrow(/not found/i);
  });

  it('rejects an already-cancelled registration', async () => {
    mocks.regFindById.mockResolvedValue({ ...installmentReg, status: 'cancelled' });
    await expect(run({ registrationId: 'reg-1' })).rejects.toThrow(/already/i);
    expect(mocks.refundPayment).not.toHaveBeenCalled();
  });

  it('requires a registration id', async () => {
    await expect(run({})).rejects.toThrow(/required/i);
  });

  it('admin partial refund: refunds the chosen amount against the reg payment', async () => {
    mocks.sectionFindById.mockResolvedValue(futureSection);

    const result = (await run({
      registrationId: 'reg-1',
      refundCents: 5000,
    })) as { status: string; refundCents: number; cancelledChargeCount: number };

    expect(mocks.refundPayment).toHaveBeenCalledTimes(1);
    expect(mocks.refundPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: 'pay-1',
        amountCents: 5000,
        idempotencyKey: 'mtrefund-reg-1', // stable
      })
    );
    // Section policy is NOT consulted when an explicit amount is given.
    expect(mocks.sectionFindById).not.toHaveBeenCalled();
    expect(result.status).toBe('refunded');
    expect(result.refundCents).toBe(5000);
    expect(result.cancelledChargeCount).toBe(1);
  });

  it('admin full refund overrides the $25 policy fee', async () => {
    mocks.sectionFindById.mockResolvedValue(futureSection);

    const result = (await run({
      registrationId: 'reg-1',
      refundCents: 13200,
    })) as { refundCents: number };

    expect(mocks.refundPayment).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: 'pay-1', amountCents: 13200 })
    );
    expect(result.refundCents).toBe(13200);
  });

  it('admin refund of 0 cancels without a Square refund', async () => {
    const result = (await run({
      registrationId: 'reg-1',
      refundCents: 0,
    })) as { status: string; refundCents: number };

    expect(mocks.refundPayment).not.toHaveBeenCalled();
    expect(result.status).toBe('cancelled');
    expect(result.refundCents).toBe(0);
  });

  it('rejects an over-refund above the captured amount (before any Square call)', async () => {
    await expect(
      run({ registrationId: 'reg-1', refundCents: 13201 })
    ).rejects.toThrow(/exceeds/i);
    expect(mocks.refundPayment).not.toHaveBeenCalled();
    expect(mocks.regUpdate).not.toHaveBeenCalled();
  });

  it('rejects a negative / non-integer refund amount', async () => {
    await expect(
      run({ registrationId: 'reg-1', refundCents: -1 })
    ).rejects.toThrow(/whole number|non-negative/i);
    await expect(
      run({ registrationId: 'reg-1', refundCents: 12.5 })
    ).rejects.toThrow(/whole number|non-negative/i);
    expect(mocks.refundPayment).not.toHaveBeenCalled();
  });

  it('installment-aware: a partial refund spans a paid installment payment', async () => {
    // Reg payment 13200 (installment 1) + a paid installment 2 of 12000.
    mocks.chargesByReg.mockResolvedValue([
      {
        id: 'chg-2',
        status: 'paid',
        squarePaymentId: 'pay-2',
        amountCents: 12000,
        installmentNumber: 2,
      },
    ]);
    mocks.refundPayment.mockImplementation(async (input: { paymentId: string }) => ({
      refundId: `ref-${input.paymentId}`,
    }));

    const result = (await run({
      registrationId: 'reg-1',
      refundCents: 20000, // 13200 from reg payment + 6800 from installment 2
    })) as { refundCents: number; refundId?: string; refundIds?: string[] };

    expect(mocks.refundPayment).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        paymentId: 'pay-1',
        amountCents: 13200,
        idempotencyKey: 'mtrefund-reg-1',
      })
    );
    expect(mocks.refundPayment).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        paymentId: 'pay-2',
        amountCents: 6800,
        idempotencyKey: 'mtrefund-reg-1-pay-2', // stable, per-payment
      })
    );
    expect(result.refundCents).toBe(20000);
    expect(result.refundId).toBe('ref-pay-1');
    expect(result.refundIds).toEqual(['ref-pay-1', 'ref-pay-2']);
  });

  it('installment-aware: over-refund rejected against total captured (reg + paid installment)', async () => {
    mocks.chargesByReg.mockResolvedValue([
      {
        id: 'chg-2',
        status: 'paid',
        squarePaymentId: 'pay-2',
        amountCents: 12000,
        installmentNumber: 2,
      },
    ]);
    // Total captured = 25200; 25201 must be rejected.
    await expect(
      run({ registrationId: 'reg-1', refundCents: 25201 })
    ).rejects.toThrow(/exceeds/i);
    expect(mocks.refundPayment).not.toHaveBeenCalled();
  });

  it('policy default clamps to captured when the reg has no payment on file', async () => {
    mocks.sectionFindById.mockResolvedValue(futureSection);
    mocks.regFindById.mockResolvedValue({
      ...installmentReg,
      squarePaymentId: undefined,
    });

    const result = (await run({ registrationId: 'reg-1' })) as {
      status: string;
      refundCents: number;
    };

    expect(mocks.refundPayment).not.toHaveBeenCalled();
    expect(result.status).toBe('cancelled');
    expect(result.refundCents).toBe(0);
  });
});
