import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveSession: vi.fn(),
  findById: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  createPublicFunction: <TReq, TRes>(handler: (d: TReq) => Promise<TRes>) =>
    handler,
  throwFailedPrecondition: (m: string) => {
    throw new Error(m);
  },
}));

vi.mock('@maple/firebase/database', () => ({
  CraftClubTokenRepository: { resolveSession: mocks.resolveSession },
  CraftClubMemberRepository: { findById: mocks.findById },
}));

import { getCraftClubSubscription } from './get-craft-club-subscription';

type Handler = (data: unknown) => Promise<{ member: Record<string, unknown> }>;
const handler = getCraftClubSubscription as unknown as Handler;

describe('getCraftClubSubscription', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a customer-safe view for a valid session', async () => {
    mocks.resolveSession.mockResolvedValue('m1');
    mocks.findById.mockResolvedValue({
      id: 'm1',
      email: 'member@example.com',
      status: 'active',
      squareCardId: 'card-secret',
      currentPeriodEndsAt: new Date('2026-07-26'),
    });

    const result = await handler({ sessionToken: 'sess' });

    expect(result.member).not.toHaveProperty('squareCardId');
    expect(result.member.status).toBe('active');
  });

  it('rejects an expired/invalid session', async () => {
    mocks.resolveSession.mockResolvedValue(undefined);
    await expect(handler({ sessionToken: 'bad' })).rejects.toThrow(
      /session has expired/
    );
    expect(mocks.findById).not.toHaveBeenCalled();
  });

  it('rejects when the member is gone', async () => {
    mocks.resolveSession.mockResolvedValue('m1');
    mocks.findById.mockResolvedValue(undefined);
    await expect(handler({ sessionToken: 'sess' })).rejects.toThrow(
      /Membership not found/
    );
  });
});
