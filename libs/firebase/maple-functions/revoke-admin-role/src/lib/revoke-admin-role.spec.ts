import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  revokeAdminRoleUtil: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  createAdminFunction: <TReq, TRes>(
    handler: (data: TReq, ctx: unknown) => Promise<TRes>
  ) => handler,
  revokeAdminRole: mocks.revokeAdminRoleUtil,
  throwInvalidArgument: (msg: string) => {
    throw new Error(msg);
  },
  throwFailedPrecondition: (msg: string) => {
    throw new Error(msg);
  },
}));

import { revokeAdminRole } from './revoke-admin-role';

type Handler = (data: unknown, ctx?: unknown) => Promise<unknown>;
const handler = revokeAdminRole as unknown as Handler;

describe('revokeAdminRole', () => {
  beforeEach(() => vi.clearAllMocks());

  it('revokes the role for another admin', async () => {
    mocks.revokeAdminRoleUtil.mockResolvedValue(undefined);

    const result = (await handler(
      { uid: 'someone-else' },
      { uid: 'katie-uid' }
    )) as { success: boolean };

    expect(result.success).toBe(true);
    expect(mocks.revokeAdminRoleUtil).toHaveBeenCalledWith('someone-else');
  });

  it("blocks an admin from revoking their own admin role", async () => {
    await expect(
      handler({ uid: 'katie-uid' }, { uid: 'katie-uid' })
    ).rejects.toThrow(/cannot revoke your own/);
    expect(mocks.revokeAdminRoleUtil).not.toHaveBeenCalled();
  });

  it('rejects missing target uid', async () => {
    await expect(handler({}, { uid: 'katie-uid' })).rejects.toThrow(
      /Target user UID is required/
    );
  });

  it('rejects missing caller uid', async () => {
    await expect(handler({ uid: 'nathan-uid' }, {})).rejects.toThrow(
      /Authentication required/
    );
  });
});
