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
  queueMail: vi.fn(),
  findCalendarTokenByEmail: vi.fn(),
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
    generateFamilyCalendarToken: () => 'fam-token-test',
    queueMail: mocks.queueMail,
    familyCalendarSubscribeUrl: (token: string) =>
      `webcal://maple-and-spruce-dev.web.app/calendar/family/${token}.ics`,
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
    MusicTogetherRegistrationRepository: {
      getDocRef: () => regRef,
      findCalendarTokenByEmail: mocks.findCalendarTokenByEmail,
    },
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
  // Weekly meetings; the first one drives the "Starts:" line in the
  // confirmation email. Deliberately unsorted to prove we pick the earliest.
  sessions: [
    { dateTime: new Date('2026-09-08T14:00:00Z') },
    { dateTime: new Date('2026-09-01T14:00:00Z') }, // Tue 10am ET
  ],
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
        // Pay-in-full: the committed total is the single charge.
        pricePaidCents: 25200,
        totalCommittedCents: 25200,
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
      cardVerificationToken: 'verf:store-token',
    })) as { amountChargedCents: number; scheduledChargeCount: number; cardLast4?: string };

    expect(mocks.upsertByEmail).toHaveBeenCalled();
    // The STORE-intent verification token must be threaded into the card vault —
    // real Square rejects cards.create without it (#622).
    expect(mocks.createCardOnFile).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'cnon:card-nonce-abc',
        customerId: 'cust-1',
        verificationToken: 'verf:store-token',
      })
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

  it('full pay: applies the sibling discount for 2 children ($378)', async () => {
    mocks.sectionFindById.mockResolvedValue(openFullOnly);

    const result = (await run({
      ...baseFamily,
      children: [
        { name: 'Sky', dob: '2023-04-01' },
        { name: 'River', dob: '2024-05-02' },
      ],
      paymentPlan: 'full',
    })) as { amountChargedCents: number };

    expect(mocks.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 37800 })
    );
    expect(result.amountChargedCents).toBe(37800);
    expect(mocks.txSet).toHaveBeenCalledWith(
      regRef,
      expect.objectContaining({ pricePaidCents: 37800 })
    );
  });

  it('full pay: applies the sibling discount for 3 children ($504)', async () => {
    mocks.sectionFindById.mockResolvedValue(openFullOnly);

    const result = (await run({
      ...baseFamily,
      children: [
        { name: 'Sky', dob: '2023-04-01' },
        { name: 'River', dob: '2024-05-02' },
        { name: 'Wren', dob: '2025-06-03' },
      ],
      paymentPlan: 'full',
    })) as { amountChargedCents: number };

    expect(mocks.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 50400 })
    );
    expect(result.amountChargedCents).toBe(50400);
  });

  it('installments: discounts installment 1 AND the scheduled charge for 3 children', async () => {
    mocks.sectionFindById.mockResolvedValue(openWithInstallments);

    const result = (await run({
      ...baseFamily,
      children: [
        { name: 'Sky', dob: '2023-04-01' },
        { name: 'River', dob: '2024-05-02' },
        { name: 'Wren', dob: '2025-06-03' },
      ],
      paymentPlan: 'installments',
      cardOnFileAuth: true,
      cardVerificationToken: 'verf:store-token',
    })) as { amountChargedCents: number; scheduledChargeCount: number };

    // Installment 1 charged now at the discounted $264.
    expect(mocks.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 26400 })
    );
    // The scheduled Week-5 charge is discounted too.
    expect(mocks.chargeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        installmentNumber: 2,
        amountCents: 26400,
        status: 'scheduled',
      })
    );
    expect(result.amountChargedCents).toBe(26400);
    expect(result.scheduledChargeCount).toBe(1);
    // The committed total is the SUM OF THE PLAN ($264 x 2), which is what the
    // Meta CAPI `Purchase` reports. Note it is NOT the discounted pay-in-full
    // price ($504) — the installment plan carries a premium.
    expect(mocks.txSet).toHaveBeenCalledWith(
      regRef,
      expect.objectContaining({ totalCommittedCents: 52800 })
    );
  });

  /**
   * `totalCommittedCents` is what `sendMusicTogetherConversion` reports to Meta,
   * so the sibling discount and the installment premium both have to land in it
   * correctly at reservation time — the trigger cannot recompute it (the
   * scheduled charges don't exist yet when it fires).
   */
  it('persists the committed plan total for a 1-child installment family', async () => {
    mocks.sectionFindById.mockResolvedValue(openWithInstallments);

    await run({
      ...baseFamily,
      paymentPlan: 'installments',
      cardOnFileAuth: true,
      cardVerificationToken: 'verf:store-token',
    });

    expect(mocks.txSet).toHaveBeenCalledWith(
      regRef,
      expect.objectContaining({
        // charged now
        pricePaidCents: 13200,
        // committed overall: 2 x $132 = $264, MORE than the $252 full price
        totalCommittedCents: 26400,
      })
    );
  });

  it('persists the sibling-discounted committed total for 2 children paid in full', async () => {
    mocks.sectionFindById.mockResolvedValue(openFullOnly);

    await run({
      ...baseFamily,
      children: [
        { name: 'Sky', dob: '2023-04-01' },
        { name: 'River', dob: '2024-05-02' },
      ],
      paymentPlan: 'full',
    });

    // $252 * 1.5 = $378 — not 2x $252.
    expect(mocks.txSet).toHaveBeenCalledWith(
      regRef,
      expect.objectContaining({
        pricePaidCents: 37800,
        totalCommittedCents: 37800,
      })
    );
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

  it('rejects installments without a card verification token — before reserving a seat or touching Square', async () => {
    mocks.sectionFindById.mockResolvedValue(openWithInstallments);
    await expect(
      run({
        ...baseFamily,
        paymentPlan: 'installments',
        cardOnFileAuth: true,
        // cardVerificationToken deliberately omitted — real Square can't vault
        // a card on file without it.
      })
    ).rejects.toThrow(/card verification is required/i);
    expect(mocks.txSet).not.toHaveBeenCalled();
    expect(mocks.upsertByEmail).not.toHaveBeenCalled();
    expect(mocks.createCardOnFile).not.toHaveBeenCalled();
    expect(mocks.createPayment).not.toHaveBeenCalled();
  });

  it('cancels the reservation when payment fails', async () => {
    mocks.sectionFindById.mockResolvedValue(openFullOnly);
    mocks.createPayment.mockRejectedValue(new Error('card declined'));

    await expect(run({ ...baseFamily, paymentPlan: 'full' })).rejects.toThrow();
    expect(mocks.regUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled' })
    );
  });

  describe('confirmation email', () => {
    it('carries the caregiver, children, and first-class details', async () => {
      mocks.sectionFindById.mockResolvedValue(openFullOnly);

      await run({ ...baseFamily, paymentPlan: 'full' });

      expect(mocks.queueMail).toHaveBeenCalledTimes(1);
      const mail = mocks.queueMail.mock.calls[0][0];
      expect(mail.templateName).toBe('music-together-confirmation');
      expect(mail.sender).toBe('music-together');
      expect(mail.data.caregiverName).toBe('Jamie Rivera');
      // Earliest session wins even though the fixture lists it second.
      expect(mail.data.firstClassDay).toBe('Tuesday');
      expect(mail.data.firstClassDate).toBe('Tuesday, September 1');
      expect(mail.data.firstClassTime).toBe('10:00 AM');
      // No section location set → the studio address.
      expect(mail.data.classLocation).toContain('688 Beulah Rd');
    });

    it('still confirms a section that has no sessions scheduled yet', async () => {
      // The template hides the "Starts:" row rather than printing a blank date.
      mocks.sectionFindById.mockResolvedValue({
        ...openFullOnly,
        sessions: undefined,
      });

      await run({ ...baseFamily, paymentPlan: 'full' });

      const mail = mocks.queueMail.mock.calls[0][0];
      expect(mail.data.firstClassDate).toBe('');
    });
  });
});
