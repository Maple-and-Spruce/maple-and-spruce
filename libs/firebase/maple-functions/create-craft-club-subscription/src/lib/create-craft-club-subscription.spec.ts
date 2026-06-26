import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  capturedHandler: null as
    | ((d: unknown, c: unknown, s: unknown, st: unknown) => Promise<unknown>)
    | null,
  findByEmail: vi.fn(),
  update: vi.fn(),
  upsertByEmail: vi.fn(),
  createCardOnFile: vi.fn(),
  subscriptionCreate: vi.fn(),
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
      throw new HttpsError('invalid-argument', `validation: ${Object.keys(e).join(',')}`);
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
    locationId = 'LOC1';
    customersService = { upsertByEmail: mocks.upsertByEmail };
    cardsService = { createCardOnFile: mocks.createCardOnFile };
    subscriptionsService = { create: mocks.subscriptionCreate };
  },
}));

vi.mock('@maple/firebase/database', () => ({
  CraftClubMemberRepository: {
    findByEmail: mocks.findByEmail,
    update: mocks.update,
  },
}));

import './create-craft-club-subscription';

const STRINGS = {
  CRAFT_CLUB_PLAN_VARIATION_ID: 'PLAN_VAR_1',
  SQUARE_ENV: 'LOCAL',
  SQUARE_LOCATION_ID: 'LOC1',
  SALES_TAX_RATE: '6.0',
};
const SECRETS = { SQUARE_ACCESS_TOKEN: 'tok' };

function run(data: unknown, strings: unknown = STRINGS) {
  return mocks.capturedHandler!(data, {}, SECRETS, strings);
}

const validPayload = {
  email: 'member@example.com',
  name: 'Member Person',
  paymentNonce: 'cnon:card-nonce-abcdef',
};

describe('createCraftClubSubscription', () => {
  beforeEach(() => vi.clearAllMocks());

  it('subscribes an approved member end to end', async () => {
    mocks.findByEmail.mockResolvedValue({
      id: 'm1',
      email: 'member@example.com',
      status: 'approved',
    });
    mocks.upsertByEmail.mockResolvedValue('cust-1');
    mocks.createCardOnFile.mockResolvedValue({ cardId: 'card-1', last4: '1111' });
    mocks.subscriptionCreate.mockResolvedValue({
      subscriptionId: 'sub-1',
      status: 'ACTIVE',
      chargedThroughDate: '2026-07-26',
    });
    mocks.update.mockImplementation(async (input) => ({ id: 'm1', ...input }));

    const result = (await run(validPayload)) as {
      member: { status: string };
      cardLast4?: string;
    };

    expect(mocks.upsertByEmail).toHaveBeenCalled();
    expect(mocks.createCardOnFile).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 'cnon:card-nonce-abcdef', customerId: 'cust-1' })
    );
    expect(mocks.subscriptionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        planVariationId: 'PLAN_VAR_1',
        customerId: 'cust-1',
        cardId: 'card-1',
      })
    );
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'm1',
        status: 'active',
        squareSubscriptionId: 'sub-1',
        squareCardId: 'card-1',
      })
    );
    expect(result.member.status).toBe('active');
    expect(result.cardLast4).toBe('1111');
  });

  it('reuses an existing Square customer id when present', async () => {
    mocks.findByEmail.mockResolvedValue({
      id: 'm1',
      email: 'member@example.com',
      status: 'cancelled',
      squareCustomerId: 'existing-cust',
    });
    mocks.createCardOnFile.mockResolvedValue({ cardId: 'card-2' });
    mocks.subscriptionCreate.mockResolvedValue({ subscriptionId: 'sub-2' });
    mocks.update.mockImplementation(async (i) => i);

    await run(validPayload);

    expect(mocks.upsertByEmail).not.toHaveBeenCalled();
    expect(mocks.createCardOnFile).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'existing-cust' })
    );
  });

  it('rejects an email that is not on the approved list (no Square calls)', async () => {
    mocks.findByEmail.mockResolvedValue(undefined);
    await expect(run(validPayload)).rejects.toThrow(/not approved/);
    expect(mocks.createCardOnFile).not.toHaveBeenCalled();
  });

  it('rejects a member who is already active', async () => {
    mocks.findByEmail.mockResolvedValue({ id: 'm1', status: 'active' });
    await expect(run(validPayload)).rejects.toThrow(/already have an active/);
    expect(mocks.subscriptionCreate).not.toHaveBeenCalled();
  });

  it('rejects invalid input before any Square call', async () => {
    await expect(
      run({ email: 'bad', name: 'X', paymentNonce: 'n' })
    ).rejects.toThrow(/validation/);
    expect(mocks.findByEmail).not.toHaveBeenCalled();
  });

  it('fails clearly when the plan is not configured', async () => {
    mocks.findByEmail.mockResolvedValue({ id: 'm1', status: 'approved' });
    await expect(
      run(validPayload, { ...STRINGS, CRAFT_CLUB_PLAN_VARIATION_ID: '' })
    ).rejects.toThrow(/plan is not configured/);
  });
});
