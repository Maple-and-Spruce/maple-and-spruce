import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  capturedHandler: null as
    | ((d: unknown, c: unknown, s: unknown, st: unknown) => Promise<unknown>)
    | null,
  resolveSession: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
  createCardOnFile: vi.fn(),
  updateCard: vi.fn(),
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
  SQUARE_SECRET_NAMES: ['SQUARE_ACCESS_TOKEN'],
  SQUARE_STRING_NAMES: ['SQUARE_ENV', 'SQUARE_LOCATION_ID', 'SALES_TAX_RATE'],
  Square: class {
    cardsService = { createCardOnFile: mocks.createCardOnFile };
    subscriptionsService = { updateCard: mocks.updateCard };
  },
}));

vi.mock('@maple/firebase/database', () => ({
  CraftClubTokenRepository: { resolveSession: mocks.resolveSession },
  CraftClubMemberRepository: {
    findById: mocks.findById,
    update: mocks.update,
  },
}));

import './update-craft-club-payment-method';

const SECRETS = { SQUARE_ACCESS_TOKEN: 't' };
const STRINGS = {
  SQUARE_ENV: 'LOCAL',
  SQUARE_LOCATION_ID: 'L',
  SALES_TAX_RATE: '6',
};
const run = (data: unknown) =>
  mocks.capturedHandler!(data, {}, SECRETS, STRINGS);

const activeMember = {
  id: 'm1',
  email: 'm@e.com',
  status: 'active',
  squareSubscriptionId: 'sub-1',
  squareCustomerId: 'cust-1',
};

describe('updateCraftClubPaymentMethod', () => {
  beforeEach(() => vi.clearAllMocks());

  it('files a new card and points the subscription at it', async () => {
    mocks.resolveSession.mockResolvedValue('m1');
    mocks.findById.mockResolvedValue(activeMember);
    mocks.createCardOnFile.mockResolvedValue({
      cardId: 'card-new',
      last4: '4242',
    });
    mocks.update.mockImplementation(async () => ({
      email: 'm@e.com',
      status: 'active',
    }));

    const result = (await run({
      sessionToken: 'sess',
      paymentNonce: 'cnon:new',
      cardVerificationToken: 'verf:store-token',
    })) as { cardLast4?: string };

    // The STORE-intent verification token must reach the card vault — real
    // Square rejects cards.create without it (#622).
    expect(mocks.createCardOnFile).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'cnon:new',
        customerId: 'cust-1',
        verificationToken: 'verf:store-token',
      })
    );
    expect(mocks.updateCard).toHaveBeenCalledWith('sub-1', 'card-new');
    expect(mocks.update).toHaveBeenCalledWith({
      id: 'm1',
      squareCardId: 'card-new',
    });
    expect(result.cardLast4).toBe('4242');
  });

  it('rejects a missing nonce', async () => {
    await expect(run({ sessionToken: 'sess' })).rejects.toThrow(
      /Payment information is required/
    );
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
});
