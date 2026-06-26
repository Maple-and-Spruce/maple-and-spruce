import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findByEmail: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  createPublicFunction: <TReq, TRes>(
    handler: (data: TReq) => Promise<TRes>
  ) => handler,
  throwInvalidArgument: (msg: string) => {
    throw new Error(msg);
  },
}));

vi.mock('@maple/firebase/database', () => ({
  CraftClubMemberRepository: { findByEmail: mocks.findByEmail },
}));

import { checkCraftClubEligibility } from './check-craft-club-eligibility';

type Handler = (data: unknown) => Promise<{ status: string; alreadyMember: boolean }>;
const handler = checkCraftClubEligibility as unknown as Handler;

describe('checkCraftClubEligibility', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns unknown for an email not on file', async () => {
    mocks.findByEmail.mockResolvedValue(undefined);
    const r = await handler({ email: 'nobody@example.com' });
    expect(r).toEqual({ status: 'unknown', alreadyMember: false });
  });

  it('returns approved for an approved member', async () => {
    mocks.findByEmail.mockResolvedValue({ status: 'approved' });
    expect(await handler({ email: 'a@b.com' })).toEqual({
      status: 'approved',
      alreadyMember: false,
    });
  });

  it('treats a cancelled member as re-subscribable (approved)', async () => {
    mocks.findByEmail.mockResolvedValue({ status: 'cancelled' });
    expect((await handler({ email: 'a@b.com' })).status).toBe('approved');
  });

  it('flags an active member as alreadyMember', async () => {
    mocks.findByEmail.mockResolvedValue({ status: 'active' });
    expect(await handler({ email: 'a@b.com' })).toEqual({
      status: 'active',
      alreadyMember: true,
    });
  });

  it('reports requested members as requested', async () => {
    mocks.findByEmail.mockResolvedValue({ status: 'requested' });
    expect((await handler({ email: 'a@b.com' })).status).toBe('requested');
  });

  it('rejects a missing email', async () => {
    await expect(handler({})).rejects.toThrow(/Email is required/);
  });
});
