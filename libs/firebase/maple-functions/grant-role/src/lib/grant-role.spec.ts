import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  grantRoleUtil: vi.fn(),
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
  grantRole: mocks.grantRoleUtil,
  throwInvalidArgument: (msg: string) => {
    throw new Error(msg);
  },
}));

import { grantRole } from './grant-role';

type Handler = (data: unknown, ctx?: unknown) => Promise<unknown>;
const handler = grantRole as unknown as Handler;

describe('grantRole', () => {
  beforeEach(() => vi.clearAllMocks());

  it('grants a scoped role with the calling admin as grantedBy', async () => {
    mocks.grantRoleUtil.mockResolvedValue(undefined);

    const result = (await handler(
      { uid: 'stephanie-uid', role: 'mt-teacher' },
      { uid: 'katie-uid' }
    )) as { success: boolean };

    expect(result.success).toBe(true);
    expect(mocks.grantRoleUtil).toHaveBeenCalledWith(
      'stephanie-uid',
      'mt-teacher',
      'katie-uid'
    );
  });

  it('rejects granting the admin role (grantAdminRole owns it)', async () => {
    await expect(
      handler({ uid: 'x-uid', role: 'admin' }, { uid: 'katie-uid' })
    ).rejects.toThrow(/Role must be one of/);
    expect(mocks.grantRoleUtil).not.toHaveBeenCalled();
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

  it('rejects missing caller uid (defensive)', async () => {
    await expect(
      handler({ uid: 'x-uid', role: 'clerk' }, {})
    ).rejects.toThrow(/Authentication required/);
  });
});
