import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  capturedHandler: null as
    | ((d: unknown, c: unknown, s: unknown, st: unknown) => Promise<unknown>)
    | null,
  sectionFindById: vi.fn(),
  chargeCreate: vi.fn(),
  upsertByEmail: vi.fn(),
  createCardOnFile: vi.fn(),
  createPayment: vi.fn(),
  txGetSize: 0,
  txSet: vi.fn(),
  regUpdate: vi.fn(),
  mailAdd: vi.fn(),
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
    handle: vi.fn((h: typeof mocks.capturedHandler) => {
      mocks.capturedHandler = h;
      return 'mock-function';
    }),
  };
  return {
    Functions: { endpoint },
    throwInvalidArgument: (m: string) => {
      throw new HttpsError('invalid-argument', m);
    },
    throwValidationError: (e: Record<string, string[]>) => {
      throw new HttpsError(
        'invalid-argument',
        `validation: ${Object.keys(e).join(',')}`
      );
    },
    throwNotFound: (entity: string, id: string) => {
      throw new HttpsError('not-found', `${entity} not found: ${id}`);
    },
    throwFailedPrecondition: (m: string) => {
      throw new HttpsError('failed-precondition', m);
    },
  };
});

vi.mock('@maple/firebase/square', () => {
  class PaymentError extends Error {
    constructor(message: string, public squareCode?: string) {
      super(message);
    }
  }
  return {
    MT_SQUARE_SECRET_NAMES: ['MT_SQUARE_ACCESS_TOKEN'],
    MT_SQUARE_STRING_NAMES: [
      'MT_SQUARE_ENV',
      'MT_SQUARE_LOCATION_ID',
      'MT_SALES_TAX_RATE',
    ],
    MT_SQUARE_KEYS: { accessTokenSecret: 'MT_SQUARE_ACCESS_TOKEN' },
    PaymentError,
    Square: class {
      locationId = 'MT_LOC';
      customersService = { upsertByEmail: mocks.upsertByEmail };
      cardsService = { createCardOnFile: mocks.createCardOnFile };
      paymentsService = { createPayment: mocks.createPayment };
    },
  };
});

const regRef = { id: 'reg-1', update: mocks.regUpdate };

vi.mock('@maple/firebase/database', () => {
  const queryStub: Record<string, unknown> = {};
  queryStub.where = () => queryStub;
  const db = {
    collection: () => ({ where: () => queryStub, add: mocks.mailAdd }),
    runTransaction: async (
      fn: (tx: {
        get: () => Promise<{ size: number }>;
        set: (...a: unknown[]) => void;
      }) => Promise<void>
    ) =>
      fn({
        get: async () => ({ size: mocks.txGetSize }),
        set: mocks.txSet,
      }),
  };
  return {
    getDb: () => db,
    MusicTogetherSectionRepository: { findById: mocks.sectionFindById },
    MusicTogetherRegistrationRepository: { getDocRef: () => regRef },
    MusicTogetherScheduledChargeRepository: { create: mocks.chargeCreate },
  };
});

import './create-music-together-registration';

const SECRETS = { MT_SQUARE_ACCESS_TOKEN: 'tok' };
const STRINGS = {
  MT_SQUARE_ENV: 'LOCAL',
  MT_SQUARE_LOCATION_ID: 'MT_LOC',
  MT_SALES_TAX_RATE: '0.0',
  ALLOWED_ORIGINS: '*',
};

function run(data: unknown) {
  return mocks.capturedHandler!(data, {}, SECRETS, STRINGS);
}

const openFullOnly = {
  id: 'sec-1',
  name: 'Spring 2026',
  visible: true,
  enrollmentActive: true,
  capacityFamilies: 8,
  priceFullCents: 25200,
  installmentPlan: undefined,
};

const openWithInstallments = {
  ...openFullOnly,
  installmentPlan: [
    { amountCents: 13200, dueAt: new Date('2026-09-01T14:00:00Z') },
    { amountCents: 13200, dueAt: new Date('2026-09-29T14:00:00Z') },
  ],
};

const baseFamily = {
  sectionId: 'sec-1',
  adultFirstName: 'Jamie',
  adultLastName: 'Rivera',
  parentNames: ['Jamie Rivera'],
  children: [{ name: 'Sky', dob: '2023-04-01' }],
  email: 'jamie@example.com',
  phone: '304-555-1212',
  address: '123 Spruce St, Morgantown, WV',
  policiesAccepted: true,
  privacyConsent: true,
  paymentNonce: 'cnon:card-nonce-abc',
};

describe('createMusicTogetherRegistration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.txGetSize = 0;
    mocks.createPayment.mockResolvedValue({
      paymentId: 'pay-1',
      receiptUrl: 'https://receipt',
    });
    mocks.upsertByEmail.mockResolvedValue('cust-1');
    mocks.createCardOnFile.mockResolvedValue({ cardId: 'card-1', last4: '4242' });
    mocks.chargeCreate.mockResolvedValue({ id: 'chg' });
  });

  it('full pay: charges the nonce once, no card vaulting, no scheduled charges', async () => {
    mocks.sectionFindById.mockResolvedValue(openFullOnly);

    const result = (await run({
      ...baseFamily,
      paymentPlan: 'full',
    })) as { amountChargedCents: number; scheduledChargeCount: number };

    expect(mocks.upsertByEmail).not.toHaveBeenCalled();
    expect(mocks.createCardOnFile).not.toHaveBeenCalled();
    expect(mocks.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'cnon:card-nonce-abc',
        amountCents: 25200,
        idempotencyKey: 'mtreg-reg-1',
      })
    );
    expect(mocks.chargeCreate).not.toHaveBeenCalled();
    expect(result.amountChargedCents).toBe(25200);
    expect(result.scheduledChargeCount).toBe(0);
    // The persisted registration carries the structured adult name, the
    // derived parentNames, accommodations, and the privacy-consent timestamp.
    expect(mocks.txSet).toHaveBeenCalledWith(
      regRef,
      expect.objectContaining({
        adultFirstName: 'Jamie',
        adultLastName: 'Rivera',
        parentNames: ['Jamie Rivera'],
        accommodations: null,
        privacyConsentAcceptedAt: expect.any(Date),
      })
    );
    expect(mocks.regUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'confirmed' })
    );
  });

  it('installments: vaults card, charges stored card for installment 1, schedules the rest', async () => {
    mocks.sectionFindById.mockResolvedValue(openWithInstallments);

    const result = (await run({
      ...baseFamily,
      paymentPlan: 'installments',
      cardOnFileAuth: true,
    })) as { amountChargedCents: number; scheduledChargeCount: number; cardLast4?: string };

    expect(mocks.upsertByEmail).toHaveBeenCalled();
    expect(mocks.createCardOnFile).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 'cnon:card-nonce-abc', customerId: 'cust-1' })
    );
    // installment 1 charges the STORED card (with customerId), not the nonce
    expect(mocks.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'card-1',
        customerId: 'cust-1',
        amountCents: 13200,
      })
    );
    // one scheduled charge for installment 2
    expect(mocks.chargeCreate).toHaveBeenCalledTimes(1);
    expect(mocks.chargeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationId: 'reg-1',
        installmentNumber: 2,
        amountCents: 13200,
        status: 'scheduled',
      })
    );
    expect(result.amountChargedCents).toBe(13200);
    expect(result.scheduledChargeCount).toBe(1);
    expect(result.cardLast4).toBe('4242');
  });

  it('rejects when the section is full — no payment taken', async () => {
    mocks.sectionFindById.mockResolvedValue(openFullOnly);
    mocks.txGetSize = 8; // at capacity

    await expect(run({ ...baseFamily, paymentPlan: 'full' })).rejects.toThrow(
      /full/i
    );
    expect(mocks.createPayment).not.toHaveBeenCalled();
  });

  it('404s an unknown section before any Square call', async () => {
    mocks.sectionFindById.mockResolvedValue(undefined);
    await expect(run({ ...baseFamily, paymentPlan: 'full' })).rejects.toThrow(
      /not found/i
    );
    expect(mocks.createPayment).not.toHaveBeenCalled();
  });

  it('rejects a section whose enrollment is paused', async () => {
    mocks.sectionFindById.mockResolvedValue({
      ...openFullOnly,
      enrollmentActive: false,
    });
    await expect(run({ ...baseFamily, paymentPlan: 'full' })).rejects.toThrow(
      /has closed/i
    );
  });

  it("rejects a section whose enrollment hasn't opened yet", async () => {
    mocks.sectionFindById.mockResolvedValue({
      ...openFullOnly,
      enrollmentActive: true,
      enrollmentOpensAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    await expect(run({ ...baseFamily, paymentPlan: 'full' })).rejects.toThrow(
      /isn't open yet/i
    );
  });

  it('rejects installments when the section offers none', async () => {
    mocks.sectionFindById.mockResolvedValue(openFullOnly); // no plan
    await expect(
      run({ ...baseFamily, paymentPlan: 'installments', cardOnFileAuth: true })
    ).rejects.toThrow(/does not offer an installment plan/i);
  });

  it('rejects invalid input before loading the section', async () => {
    await expect(
      run({ ...baseFamily, paymentPlan: 'full', policiesAccepted: false })
    ).rejects.toThrow(/validation/);
    expect(mocks.sectionFindById).not.toHaveBeenCalled();
  });

  it('rejects a registration without privacy consent', async () => {
    await expect(
      run({ ...baseFamily, paymentPlan: 'full', privacyConsent: false })
    ).rejects.toThrow(/validation/);
    expect(mocks.sectionFindById).not.toHaveBeenCalled();
  });

  it('requires card-on-file auth for the installment plan', async () => {
    mocks.sectionFindById.mockResolvedValue(openWithInstallments);
    await expect(
      run({ ...baseFamily, paymentPlan: 'installments', cardOnFileAuth: false })
    ).rejects.toThrow(/validation/);
  });

  it('cancels the reservation when payment fails', async () => {
    mocks.sectionFindById.mockResolvedValue(openFullOnly);
    mocks.createPayment.mockRejectedValue(new Error('card declined'));

    await expect(run({ ...baseFamily, paymentPlan: 'full' })).rejects.toThrow();
    expect(mocks.regUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled' })
    );
  });
});
