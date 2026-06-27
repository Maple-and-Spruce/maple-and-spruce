import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  capturedHandler: null as
    | ((d: unknown, c: unknown, s: unknown, st: unknown) => Promise<unknown>)
    | null,
  findById: vi.fn(),
  update: vi.fn(),
  pause: vi.fn(),
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
    requiringRole: vi.fn(() => endpoint),
    handle: vi.fn((h: typeof mocks.capturedHandler) => {
      mocks.capturedHandler = h;
      return 'mock';
    }),
  };
  return {
    Functions: { endpoint },
    Role: { Admin: 'admin' },
    throwInvalidArgument: (m: string) => {
      throw new HttpsError('invalid-argument', m);
    },
    throwNotFound: (e: string, id: string) => {
      throw new HttpsError('not-found', `${e} ${id} not found`);
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
    subscriptionsService = { pause: mocks.pause };
  },
}));

vi.mock('@maple/firebase/database', () => ({
  CraftClubMemberRepository: {
    findById: mocks.findById,
    update: mocks.update,
  },
}));

import './admin-pause-craft-club-subscription';

const run = (data: unknown) =>
  mocks.capturedHandler!(data, {}, { SQUARE_ACCESS_TOKEN: 't' }, {});

describe('adminPauseCraftClubSubscription', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pauses the Square subscription and marks the member paused', async () => {
    mocks.findById.mockResolvedValue({
      id: 'm1',
      status: 'active',
      squareSubscriptionId: 'sub-1',
    });
    mocks.update.mockImplementation(async (i) => ({ status: i.status }));

    const result = (await run({ id: 'm1' })) as { member: { status: string } };

    expect(mocks.pause).toHaveBeenCalledWith('sub-1');
    expect(mocks.update).toHaveBeenCalledWith({ id: 'm1', status: 'paused' });
    expect(result.member.status).toBe('paused');
  });

  it('rejects a member with no subscription', async () => {
    mocks.findById.mockResolvedValue({ id: 'm1', status: 'approved' });
    await expect(run({ id: 'm1' })).rejects.toThrow(/no subscription to pause/);
    expect(mocks.pause).not.toHaveBeenCalled();
  });

  it('rejects an unknown member', async () => {
    mocks.findById.mockResolvedValue(undefined);
    await expect(run({ id: 'gone' })).rejects.toThrow(/not found/);
  });
});
