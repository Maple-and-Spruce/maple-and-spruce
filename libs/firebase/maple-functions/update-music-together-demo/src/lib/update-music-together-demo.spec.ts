import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  capturedHandler: null as ((d: unknown) => Promise<unknown>) | null,
  findById: vi.fn(),
  update: vi.fn(),
  validation: vi.fn(),
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
    throwValidationError: (errs: Record<string, string[]>) => {
      throw new HttpsError('invalid-argument', `validation: ${Object.keys(errs).join(',')}`);
    },
    Role: { Admin: 'admin', MtTeacher: 'mt-teacher' },
  };
});
vi.mock('@maple/firebase/database', () => ({
  MusicTogetherDemoRepository: {
    findById: mocks.findById,
    update: mocks.update,
  },
}));
vi.mock('@maple/ts/validation', () => ({
  musicTogetherDemoValidation: mocks.validation,
}));

import './update-music-together-demo';

function run(data: unknown) {
  return mocks.capturedHandler!(data);
}

describe('updateMusicTogetherDemo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validation.mockReturnValue({ hasErrors: () => false, getErrors: () => ({}) });
  });

  it('rejects a missing id', async () => {
    await expect(run({})).rejects.toThrow(/Demo ID is required/);
  });

  it('404s when the demo is missing', async () => {
    mocks.findById.mockResolvedValue(undefined);
    await expect(run({ id: 'nope', location: 'x' })).rejects.toThrow(/not found/);
  });

  it('validates only the changed fields against the merged record', async () => {
    mocks.findById.mockResolvedValue({
      id: 'demo-1',
      dateTime: new Date('2030-08-03T14:00:00Z'),
      location: 'Library',
      capacityFamilies: 8,
      visible: false,
    });
    mocks.update.mockResolvedValue({ id: 'demo-1', location: 'New Hall' });

    const result = (await run({ id: 'demo-1', location: 'New Hall' })) as {
      demo: { id: string };
    };

    // Only 'location' is validated (partial-edit pattern).
    expect(mocks.validation).toHaveBeenCalledWith(
      expect.objectContaining({ location: 'New Hall', capacityFamilies: 8 }),
      ['location']
    );
    expect(mocks.update).toHaveBeenCalledWith({ id: 'demo-1', location: 'New Hall' });
    expect(result.demo.id).toBe('demo-1');
  });

  it('throws when validation fails', async () => {
    mocks.findById.mockResolvedValue({ id: 'demo-1', location: 'Library' });
    mocks.validation.mockReturnValue({
      hasErrors: () => true,
      getErrors: () => ({ location: ['Location is required'] }),
    });
    await expect(run({ id: 'demo-1', location: '' })).rejects.toThrow(/validation/);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
