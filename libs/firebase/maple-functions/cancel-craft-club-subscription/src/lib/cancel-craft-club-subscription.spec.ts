import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  capturedHandler: null as
    | ((d: unknown, c: unknown, s: unknown, st: unknown) => Promise<unknown>)
    | null,
  resolveSession: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
  cancel: vi.fn(),
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
    throwFailedPrecondition: (m: string) => {
      throw new HttpsError('failed-precondition', m);
    },
  };
});

vi.mock('@maple/firebase/square', () => ({
  SQUARE_SECRET_NAMES: ['SQUARE_ACCESS_TOKEN'],
  SQUARE_STRING_NAMES: ['SQUARE_ENV', 'SQUARE_LOCATION_ID', 'SALES_TAX_RATE'],
  Square: class {
    subscriptionsService = { cancel: mocks.cancel };
  },
}));

vi.mock('@maple/firebase/database', () => ({
  CraftClubTokenRepository: { resolveSession: mocks.resolveSession },
  CraftClubMemberRepository: {
    findById: mocks.findById,
    update: mocks.update,
  },
}));

import './cancel-craft-club-subscription';

const SECRETS = { SQUARE_ACCESS_TOKEN: 't' };
const STRINGS = {
  SQUARE_ENV: 'LOCAL',
  SQUARE_LOCATION_ID: 'L',
  SALES_TAX_RATE: '6',
};
const run = (data: unknown) =>
  mocks.capturedHandler!(data, {}, SECRETS, STRINGS);

describe('cancelCraftClubSubscription', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cancels the Square subscription and marks the member cancelled', async () => {
    mocks.resolveSession.mockResolvedValue('m1');
    mocks.findById.mockResolvedValue({
      id: 'm1',
      email: 'm@e.com',
      status: 'active',
      squareSubscriptionId: 'sub-1',
    });
    mocks.cancel.mockResolvedValue({
      status: 'CANCELED',
      canceledDate: '2026-08-26',
    });
    mocks.update.mockImplementation(async (i) => ({
      email: 'm@e.com',
      status: i.status,
    }));

    const result = (await run({ sessionToken: 'sess' })) as {
      member: { status: string };
    };

    expect(mocks.cancel).toHaveBeenCalledWith('sub-1');
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm1', status: 'cancelled' })
    );
    expect(result.member.status).toBe('cancelled');
  });

  it('rejects an expired session before any Square call', async () => {
    mocks.resolveSession.mockResolvedValue(undefined);
    await expect(run({ sessionToken: 'bad' })).rejects.toThrow(
      /session has expired/
    );
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it('rejects when there is no subscription to cancel', async () => {
    mocks.resolveSession.mockResolvedValue('m1');
    mocks.findById.mockResolvedValue({ id: 'm1', status: 'approved' });
    await expect(run({ sessionToken: 'sess' })).rejects.toThrow(
      /No active subscription/
    );
  });
});
