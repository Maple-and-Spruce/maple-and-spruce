import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  capturedHandler: null as ((d: unknown) => Promise<unknown>) | null,
  findById: vi.fn(),
  del: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => {
  class HttpsError extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  }
  return {
    createRoleFunction: (
      handler: typeof mocks.capturedHandler,
      _roles: unknown
    ) => {
      mocks.capturedHandler = handler;
      return 'mock-fn';
    },
    throwInvalidArgument: (msg: string) => {
      throw new HttpsError('invalid-argument', msg);
    },
    throwNotFound: (entity: string, id: string) => {
      throw new HttpsError('not-found', `${entity} ${id} not found`);
    },
    Role: { Admin: 'admin', MtTeacher: 'mt-teacher' },
  };
});
vi.mock('@maple/firebase/database', () => ({
  MusicTogetherDemoRepository: {
    findById: mocks.findById,
    delete: mocks.del,
  },
}));

import './delete-music-together-demo';

function run(data: unknown) {
  return mocks.capturedHandler!(data);
}

describe('deleteMusicTogetherDemo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a missing id', async () => {
    await expect(run({})).rejects.toThrow(/Demo ID is required/);
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it('404s when the demo is missing', async () => {
    mocks.findById.mockResolvedValue(undefined);
    await expect(run({ id: 'nope' })).rejects.toThrow(/not found/);
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it('deletes an existing demo', async () => {
    mocks.findById.mockResolvedValue({ id: 'demo-1' });
    const result = (await run({ id: 'demo-1' })) as { deleted: boolean };
    expect(mocks.del).toHaveBeenCalledWith('demo-1');
    expect(result.deleted).toBe(true);
  });
});
