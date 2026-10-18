import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  grantAdminRoleUtil: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  Role: {
    Admin: 'admin',
    MtTeacher: 'mt-teacher',
    Clerk: 'clerk',
    LessonTeacher: 'lesson-teacher',
  },
  grantAdminRole: mocks.grantAdminRoleUtil,
  throwInvalidArgument: (msg: string) => {
    throw new Error(msg);
  },
}));

import { grantAdminRole } from './users';

type Handler = (data: unknown, ctx?: unknown) => Promise<unknown>;
const handler = grantAdminRole as unknown as Handler;

describe('grantAdminRole', () => {
  beforeEach(() => vi.clearAllMocks());

  it('grants the role with the calling admin as grantedBy', async () => {
    mocks.grantAdminRoleUtil.mockResolvedValue(undefined);

    const result = (await handler(
      { uid: 'nathan-uid' },
      { uid: 'katie-uid' },
    )) as { success: boolean };

    expect(result.success).toBe(true);
    expect(mocks.grantAdminRoleUtil).toHaveBeenCalledWith(
      'nathan-uid',
      'katie-uid',
    );
  });

  it('rejects missing target uid', async () => {
    await expect(handler({}, { uid: 'katie-uid' })).rejects.toThrow(
      /Target user UID is required/,
    );
  });

  it('rejects missing caller uid (defensive)', async () => {
    await expect(handler({ uid: 'nathan-uid' }, {})).rejects.toThrow(
      /Authentication required/,
    );
  });
});
