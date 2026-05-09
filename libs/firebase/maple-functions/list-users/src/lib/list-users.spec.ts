import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAdminUids: vi.fn(),
  authListUsers: vi.fn(),
  adminApps: [] as unknown[],
  adminInitializeApp: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  createAdminFunction: <TReq, TRes>(
    handler: (data: TReq, ctx: unknown) => Promise<TRes>
  ) => handler,
  getAdminUids: mocks.getAdminUids,
  throwInvalidArgument: (msg: string) => {
    throw new Error(msg);
  },
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ listUsers: mocks.authListUsers }),
}));

vi.mock('firebase-admin', () => ({
  default: {
    get apps() {
      return mocks.adminApps;
    },
    initializeApp: mocks.adminInitializeApp,
  },
}));

import { listUsers } from './list-users';

type Handler = (data: unknown, ctx?: unknown) => Promise<unknown>;
const handler = listUsers as unknown as Handler;

const authUserNathan = {
  uid: 'nathan-uid',
  email: 'nathan@example.com',
  displayName: 'Nathan',
  photoURL: undefined,
  emailVerified: true,
  disabled: false,
  metadata: {
    creationTime: 'Mon, 01 Apr 2026 12:00:00 GMT',
    lastSignInTime: 'Wed, 07 May 2026 09:30:00 GMT',
  },
};

const authUserKatie = {
  uid: 'katie-uid',
  email: 'katie@example.com',
  displayName: 'Katie',
  photoURL: undefined,
  emailVerified: true,
  disabled: false,
  metadata: {
    creationTime: 'Mon, 01 Jan 2026 12:00:00 GMT',
    lastSignInTime: 'Thu, 08 May 2026 14:00:00 GMT',
  },
};

const authUserNoSignIn = {
  uid: 'lurker-uid',
  email: 'lurker@example.com',
  displayName: undefined,
  photoURL: undefined,
  emailVerified: false,
  disabled: false,
  metadata: {
    creationTime: 'Wed, 07 May 2026 10:00:00 GMT',
    lastSignInTime: undefined,
  },
};

describe('listUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminApps.length = 0;
  });

  it('marks users with admin records as isAdmin', async () => {
    mocks.getAdminUids.mockResolvedValue(['katie-uid']);
    mocks.authListUsers.mockResolvedValue({
      users: [authUserNathan, authUserKatie, authUserNoSignIn],
    });

    const result = (await handler({}, { uid: 'katie-uid' })) as {
      users: Array<{ uid: string; isAdmin: boolean }>;
      hasMore: boolean;
    };

    const byUid = new Map(result.users.map((u) => [u.uid, u]));
    expect(byUid.get('katie-uid')?.isAdmin).toBe(true);
    expect(byUid.get('nathan-uid')?.isAdmin).toBe(false);
    expect(byUid.get('lurker-uid')?.isAdmin).toBe(false);
  });

  it('sorts users by most recent sign-in, with never-signed-in last', async () => {
    mocks.getAdminUids.mockResolvedValue([]);
    mocks.authListUsers.mockResolvedValue({
      users: [authUserNathan, authUserKatie, authUserNoSignIn],
    });

    const result = (await handler({}, { uid: 'katie-uid' })) as {
      users: Array<{ uid: string }>;
    };

    expect(result.users.map((u) => u.uid)).toEqual([
      'katie-uid', // 2026-05-08
      'nathan-uid', // 2026-05-07
      'lurker-uid', // never signed in
    ]);
  });

  it('initializes Firebase Admin if not yet initialized', async () => {
    mocks.getAdminUids.mockResolvedValue([]);
    mocks.authListUsers.mockResolvedValue({ users: [] });

    await handler({}, { uid: 'katie-uid' });
    expect(mocks.adminInitializeApp).toHaveBeenCalledTimes(1);
  });

  it('skips initializeApp when admin SDK is already initialized', async () => {
    mocks.adminApps.push({});
    mocks.getAdminUids.mockResolvedValue([]);
    mocks.authListUsers.mockResolvedValue({ users: [] });

    await handler({}, { uid: 'katie-uid' });
    expect(mocks.adminInitializeApp).not.toHaveBeenCalled();
  });

  it('caps the limit at 1000 (Firebase Auth max)', async () => {
    mocks.getAdminUids.mockResolvedValue([]);
    mocks.authListUsers.mockResolvedValue({ users: [] });

    await handler({ limit: 5000 }, { uid: 'katie-uid' });
    expect(mocks.authListUsers).toHaveBeenCalledWith(1000);
  });

  it('rejects non-positive limits', async () => {
    await expect(
      handler({ limit: 0 }, { uid: 'katie-uid' })
    ).rejects.toThrow(/greater than 0/);
  });

  it('reports hasMore when Firebase returns a page token', async () => {
    mocks.getAdminUids.mockResolvedValue([]);
    mocks.authListUsers.mockResolvedValue({
      users: [],
      pageToken: 'next-page-token',
    });

    const result = (await handler({}, { uid: 'katie-uid' })) as {
      hasMore: boolean;
    };
    expect(result.hasMore).toBe(true);
  });
});
