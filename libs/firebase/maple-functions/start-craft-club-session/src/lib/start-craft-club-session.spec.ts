import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  consumeAccessToken: vi.fn(),
  createSession: vi.fn(),
  findByEmail: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  createPublicFunction: <TReq, TRes>(handler: (d: TReq) => Promise<TRes>) =>
    handler,
  throwInvalidArgument: (m: string) => {
    throw new Error(m);
  },
  throwFailedPrecondition: (m: string) => {
    throw new Error(m);
  },
}));

vi.mock('@maple/firebase/database', () => ({
  CraftClubTokenRepository: {
    consumeAccessToken: mocks.consumeAccessToken,
    createSession: mocks.createSession,
  },
  CraftClubMemberRepository: { findByEmail: mocks.findByEmail },
}));

import { startCraftClubSession } from './start-craft-club-session';

type Handler = (data: unknown) => Promise<{
  sessionToken: string;
  member: Record<string, unknown>;
}>;
const handler = startCraftClubSession as unknown as Handler;

describe('startCraftClubSession', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exchanges a valid token for a session and a customer-safe view', async () => {
    mocks.consumeAccessToken.mockResolvedValue('member@example.com');
    mocks.findByEmail.mockResolvedValue({
      id: 'm1',
      email: 'member@example.com',
      status: 'active',
      squareSubscriptionId: 'sub-secret',
      squareCustomerId: 'cust-secret',
    });
    mocks.createSession.mockResolvedValue('session-token-xyz');

    const result = await handler({ token: 'magic' });

    expect(mocks.createSession).toHaveBeenCalledWith('m1');
    expect(result.sessionToken).toBe('session-token-xyz');
    // Public view must NOT leak Square identifiers.
    expect(result.member).not.toHaveProperty('squareSubscriptionId');
    expect(result.member).not.toHaveProperty('squareCustomerId');
    expect(result.member.status).toBe('active');
  });

  it('rejects a missing token', async () => {
    await expect(handler({})).rejects.toThrow(/Token is required/);
  });

  it('rejects an invalid or expired token', async () => {
    mocks.consumeAccessToken.mockResolvedValue(undefined);
    await expect(handler({ token: 'bad' })).rejects.toThrow(
      /invalid or has expired/
    );
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('rejects when the member no longer exists', async () => {
    mocks.consumeAccessToken.mockResolvedValue('gone@example.com');
    mocks.findByEmail.mockResolvedValue(undefined);
    await expect(handler({ token: 'magic' })).rejects.toThrow(
      /Membership not found/
    );
  });
});
