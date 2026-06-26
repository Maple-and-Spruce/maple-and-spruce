import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findAll: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  createAdminFunction: <TReq, TRes>(
    handler: (data: TReq, ctx: unknown) => Promise<TRes>
  ) => handler,
}));

vi.mock('@maple/firebase/database', () => ({
  CraftClubMemberRepository: { findAll: mocks.findAll },
}));

import { getCraftClubMembers } from './get-craft-club-members';

type Handler = (data: unknown, ctx?: unknown) => Promise<unknown>;
const handler = getCraftClubMembers as unknown as Handler;

describe('getCraftClubMembers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns members and forwards the status filter', async () => {
    const members = [{ id: 'm1', email: 'a@b.com', status: 'active' }];
    mocks.findAll.mockResolvedValue(members);

    const result = (await handler({ status: 'active' }, { uid: 'admin' })) as {
      members: unknown[];
    };

    expect(result.members).toEqual(members);
    expect(mocks.findAll).toHaveBeenCalledWith({ status: 'active' });
  });

  it('passes undefined status when no filter is supplied', async () => {
    mocks.findAll.mockResolvedValue([]);

    await handler({}, { uid: 'admin' });

    expect(mocks.findAll).toHaveBeenCalledWith({ status: undefined });
  });
});
