import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  capturedHandler: null as
    | ((d: unknown, c: unknown, s: unknown, st: unknown) => Promise<unknown>)
    | null,
  findById: vi.fn(),
  update: vi.fn(),
  cancel: vi.fn(),
  mailAdd: vi.fn(),
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
    subscriptionsService = { cancel: mocks.cancel };
  },
}));

vi.mock('@maple/firebase/database', () => ({
  CraftClubMemberRepository: {
    findById: mocks.findById,
    update: mocks.update,
  },
  getDb: () => ({ collection: () => ({ add: mocks.mailAdd }) }),
}));

import './admin-cancel-craft-club-subscription';

const run = (data: unknown) =>
  mocks.capturedHandler!(data, {}, { SQUARE_ACCESS_TOKEN: 't' }, {});

describe('adminCancelCraftClubSubscription', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cancels the subscription, marks cancelled, and emails the member', async () => {
    mocks.findById.mockResolvedValue({
      id: 'm1',
      email: 'm@e.com',
      name: 'Member',
      status: 'active',
      squareSubscriptionId: 'sub-1',
    });
    mocks.cancel.mockResolvedValue({ canceledDate: '2026-08-26' });
    mocks.update.mockImplementation(async (i) => ({
      email: 'm@e.com',
      name: 'Member',
      status: i.status,
      currentPeriodEndsAt: i.currentPeriodEndsAt,
    }));

    const result = (await run({ id: 'm1' })) as { member: { status: string } };

    expect(mocks.cancel).toHaveBeenCalledWith('sub-1');
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm1', status: 'cancelled' })
    );
    expect(result.member.status).toBe('cancelled');
    expect(mocks.mailAdd).toHaveBeenCalledTimes(1);
    expect(mocks.mailAdd.mock.calls[0][0].template.name).toBe(
      'craft-club-cancelled'
    );
  });

  it('rejects a member with no subscription', async () => {
    mocks.findById.mockResolvedValue({ id: 'm1', status: 'approved' });
    await expect(run({ id: 'm1' })).rejects.toThrow(/no subscription to cancel/);
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
});
