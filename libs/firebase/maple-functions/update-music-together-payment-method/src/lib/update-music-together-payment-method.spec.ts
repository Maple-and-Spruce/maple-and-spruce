import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  capturedHandler: null as
    | ((d: unknown, c: unknown, s: unknown, st: unknown) => Promise<unknown>)
    | null,
  resolveSession: vi.fn(),
  findRegistrationById: vi.fn(),
  updateRegistration: vi.fn(),
  findSectionById: vi.fn(),
  findByRegistrationId: vi.fn(),
  createCardOnFile: vi.fn(),
  disableCard: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => {
  class HttpsError extends Error {
    constructor(public code: string, m: string) {
      super(m);
    }
  }
  const endpoint = {
    usingSecrets: vi.fn(() => endpoint),
    usingStrings: vi.fn(() => endpoint),
    handle: vi.fn((h: typeof mocks.capturedHandler) => {
      mocks.capturedHandler = h;
      return 'mock';
    }),
  };
  return {
    Functions: { endpoint },
    throwInvalidArgument: (m: string) => {
      throw new HttpsError('invalid-argument', m);
    },
    throwFailedPrecondition: (m: string) => {
      throw new HttpsError('failed-precondition', m);
    },
  };
});

vi.mock('@maple/firebase/square', () => ({
  MT_SQUARE_SECRET_NAMES: ['MT_SQUARE_ACCESS_TOKEN'],
  MT_SQUARE_STRING_NAMES: ['MT_SQUARE_ENV', 'MT_SQUARE_LOCATION_ID'],
  MT_SQUARE_KEYS: {
    accessToken: 'MT_SQUARE_ACCESS_TOKEN',
    env: 'MT_SQUARE_ENV',
    locationId: 'MT_SQUARE_LOCATION_ID',
  },
  Square: class {
    cardsService = {
      createCardOnFile: mocks.createCardOnFile,
      disableCard: mocks.disableCard,
    };
  },
}));

vi.mock('@maple/firebase/database', () => ({
  MusicTogetherTokenRepository: { resolveSession: mocks.resolveSession },
  MusicTogetherRegistrationRepository: {
    findById: mocks.findRegistrationById,
    update: mocks.updateRegistration,
  },
  MusicTogetherSectionRepository: { findById: mocks.findSectionById },
  MusicTogetherScheduledChargeRepository: {
    findByRegistrationId: mocks.findByRegistrationId,
  },
}));

import './update-music-together-payment-method';

const SECRETS = { MT_SQUARE_ACCESS_TOKEN: 't' };
const STRINGS = { MT_SQUARE_ENV: 'LOCAL', MT_SQUARE_LOCATION_ID: 'L' };
const run = (data: unknown) =>
  mocks.capturedHandler!(data, {}, SECRETS, STRINGS);

const installmentReg = {
  id: 'reg-1',
  sectionId: 'sec-1',
  parentNames: ['Ada Lovelace'],
  adultFirstName: 'Ada',
  adultLastName: 'Lovelace',
  email: 'ada@e.com',
  paymentPlan: 'installments',
  status: 'confirmed',
  squareCustomerId: 'cust-1',
  squareCardId: 'card-old',
};

describe('updateMusicTogetherPaymentMethod', () => {
  beforeEach(() => vi.clearAllMocks());

  it('vaults a new card, repoints the registration, and disables the old card', async () => {
    mocks.resolveSession.mockResolvedValue('reg-1');
    mocks.findRegistrationById.mockResolvedValue(installmentReg);
    mocks.createCardOnFile.mockResolvedValue({
      cardId: 'card-new',
      last4: '4242',
    });
    mocks.updateRegistration.mockResolvedValue({
      ...installmentReg,
      squareCardId: 'card-new',
    });
    mocks.findSectionById.mockResolvedValue({ id: 'sec-1', name: 'Fall Babies' });
    mocks.findByRegistrationId.mockResolvedValue([
      {
        id: 'c2',
        amountCents: 9500,
        dueAt: new Date('2026-09-15T13:00:00Z'),
        status: 'scheduled',
      },
    ]);

    const result = (await run({
      sessionToken: 'sess',
      paymentNonce: 'cnon:new',
      cardVerificationToken: 'verf:store-token',
    })) as { cardLast4?: string; registration: { nextInstallment?: unknown } };

    // The STORE-intent verification token must reach the card vault — real
    // Square rejects cards.create without it (#622).
    expect(mocks.createCardOnFile).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'cnon:new',
        customerId: 'cust-1',
        verificationToken: 'verf:store-token',
      })
    );
    // Registration repointed BEFORE the old card is disabled.
    expect(mocks.updateRegistration).toHaveBeenCalledWith({
      id: 'reg-1',
      squareCardId: 'card-new',
    });
    const updateOrder =
      mocks.updateRegistration.mock.invocationCallOrder[0];
    const disableOrder = mocks.disableCard.mock.invocationCallOrder[0];
    expect(updateOrder).toBeLessThan(disableOrder);
    expect(mocks.disableCard).toHaveBeenCalledWith('card-old');
    expect(result.cardLast4).toBe('4242');
    expect(result.registration.nextInstallment).toMatchObject({
      amountLabel: '$95.00',
    });
  });

  it('still succeeds when disabling the old card fails (best-effort)', async () => {
    mocks.resolveSession.mockResolvedValue('reg-1');
    mocks.findRegistrationById.mockResolvedValue(installmentReg);
    mocks.createCardOnFile.mockResolvedValue({
      cardId: 'card-new',
      last4: '4242',
    });
    mocks.updateRegistration.mockResolvedValue({
      ...installmentReg,
      squareCardId: 'card-new',
    });
    mocks.disableCard.mockRejectedValue(new Error('Square down'));
    mocks.findSectionById.mockResolvedValue({ id: 'sec-1', name: 'Fall Babies' });
    mocks.findByRegistrationId.mockResolvedValue([]);

    const result = (await run({
      sessionToken: 'sess',
      paymentNonce: 'cnon:new',
      cardVerificationToken: 'verf:store-token',
    })) as { cardLast4?: string };

    expect(result.cardLast4).toBe('4242');
    expect(mocks.updateRegistration).toHaveBeenCalled();
  });

  it('rejects a missing nonce before any Square call', async () => {
    await expect(run({ sessionToken: 'sess' })).rejects.toThrow(
      /Payment information is required/
    );
    expect(mocks.resolveSession).not.toHaveBeenCalled();
  });

  it('rejects a missing card verification token before any Square call', async () => {
    await expect(
      run({ sessionToken: 'sess', paymentNonce: 'cnon:new' })
    ).rejects.toThrow(/card verification is required/i);
    expect(mocks.resolveSession).not.toHaveBeenCalled();
    expect(mocks.createCardOnFile).not.toHaveBeenCalled();
  });

  it('rejects an expired session before any Square call', async () => {
    mocks.resolveSession.mockResolvedValue(undefined);
    await expect(
      run({
        sessionToken: 'bad',
        paymentNonce: 'cnon:new',
        cardVerificationToken: 'verf:store-token',
      })
    ).rejects.toThrow(/session has expired/);
    expect(mocks.createCardOnFile).not.toHaveBeenCalled();
  });

  it('rejects a pay-in-full registration (nothing on file)', async () => {
    mocks.resolveSession.mockResolvedValue('reg-1');
    mocks.findRegistrationById.mockResolvedValue({
      ...installmentReg,
      paymentPlan: 'full',
    });
    await expect(
      run({
        sessionToken: 'sess',
        paymentNonce: 'cnon:new',
        cardVerificationToken: 'verf:store-token',
      })
    ).rejects.toThrow(/no card on file/i);
    expect(mocks.createCardOnFile).not.toHaveBeenCalled();
  });

  it('rejects a cancelled registration', async () => {
    mocks.resolveSession.mockResolvedValue('reg-1');
    mocks.findRegistrationById.mockResolvedValue({
      ...installmentReg,
      status: 'cancelled',
    });
    await expect(
      run({
        sessionToken: 'sess',
        paymentNonce: 'cnon:new',
        cardVerificationToken: 'verf:store-token',
      })
    ).rejects.toThrow(/can no longer be managed/i);
    expect(mocks.createCardOnFile).not.toHaveBeenCalled();
  });
});
