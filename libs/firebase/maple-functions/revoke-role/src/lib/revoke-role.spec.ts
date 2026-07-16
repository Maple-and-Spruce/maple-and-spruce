import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  revokeRoleUtil: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  Functions: {
    endpoint: {
      requiringRole: () => ({
        handle: <TReq, TRes>(
          handler: (data: TReq, ctx: unknown) => Promise<TRes>
        ) => handler,
      }),
    },
  },
  Role: {
    Admin: 'admin',
    MtTeacher: 'mt-teacher',
    Clerk: 'clerk',
    LessonTeacher: 'lesson-teacher',
  },
  revokeRole: mocks.revokeRoleUtil,
  throwInvalidArgument: (msg: string) => {
    throw new Error(msg);
  },
}));

import { revokeRole } from './revoke-role';

type Handler = (data: unknown, ctx?: unknown) => Promise<unknown>;
const handler = revokeRole as unknown as Handler;

describe('revokeRole', () => {
  beforeEach(() => vi.clearAllMocks());

  it('revokes a scoped role', async () => {
    mocks.revokeRoleUtil.mockResolvedValue(undefined);

    const result = (await handler(
      { uid: 'nathan-uid', role: 'clerk' },
      { uid: 'katie-uid' }
    )) as { success: boolean };

    expect(result.success).toBe(true);
    expect(mocks.revokeRoleUtil).toHaveBeenCalledWith('nathan-uid', 'clerk');
  });

  it('rejects revoking the admin role (revokeAdminRole owns it)', async () => {
    await expect(
      handler({ uid: 'x-uid', role: 'admin' }, { uid: 'katie-uid' })
    ).rejects.toThrow(/Role must be one of/);
    expect(mocks.revokeRoleUtil).not.toHaveBeenCalled();
  });

  it('rejects an unknown role', async () => {
    await expect(
      handler({ uid: 'x-uid', role: 'superuser' }, { uid: 'katie-uid' })
    ).rejects.toThrow(/Role must be one of/);
  });

  it('rejects missing target uid', async () => {
    await expect(
      handler({ role: 'clerk' }, { uid: 'katie-uid' })
    ).rejects.toThrow(/Target user UID is required/);
  });
});
