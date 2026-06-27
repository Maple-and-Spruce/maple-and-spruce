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
});
