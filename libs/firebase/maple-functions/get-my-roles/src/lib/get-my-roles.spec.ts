import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUserRoles: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  Functions: {
    endpoint: {
      requiringAuth: () => ({
        handle: <TReq, TRes>(
          handler: (data: TReq, ctx: unknown) => Promise<TRes>
        ) => handler,
      }),
    },
  },
  getUserRoles: mocks.getUserRoles,
}));

import { getMyRoles } from './get-my-roles';

type Handler = (data: unknown, ctx?: unknown) => Promise<unknown>;
const handler = getMyRoles as unknown as Handler;

describe('getMyRoles', () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the caller's roles", async () => {
    mocks.getUserRoles.mockResolvedValue(['clerk', 'lesson-teacher']);

    const result = (await handler({}, { uid: 'nathan-uid' })) as {
      roles: string[];
    };

    expect(result.roles).toEqual(['clerk', 'lesson-teacher']);
    expect(mocks.getUserRoles).toHaveBeenCalledWith('nathan-uid');
  });

  it('returns empty roles without a uid (defensive)', async () => {
    const result = (await handler({}, {})) as { roles: string[] };

    expect(result.roles).toEqual([]);
    expect(mocks.getUserRoles).not.toHaveBeenCalled();
  });
});
