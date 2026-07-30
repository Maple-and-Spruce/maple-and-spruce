import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  capturedHandler: null as ((d: unknown) => Promise<unknown>) | null,
  findById: vi.fn(),
  demoRsvpAdd: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => {
  class HttpsError extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  }
  const endpoint = {
    withOptions: vi.fn(() => endpoint),
    handle: vi.fn((h: typeof mocks.capturedHandler) => {
      mocks.capturedHandler = h;
      return 'mock-fn';
    }),
  };
  return {
    Functions: { endpoint },
    throwValidationError: (errs: Record<string, string[]>) => {
      throw new HttpsError(
        'invalid-argument',
        `validation: ${Object.keys(errs).join(',')}`
      );
    },
    throwNotFound: (entity: string, id: string) => {
      throw new HttpsError('not-found', `${entity} ${id} not found`);
    },
    throwFailedPrecondition: (msg: string) => {
      throw new HttpsError('failed-precondition', msg);
    },
  };
});

vi.mock('@maple/firebase/database', () => ({
  MusicTogetherDemoRepository: { findById: mocks.findById },
  MusicTogetherDemoRsvpRepository: { add: mocks.demoRsvpAdd },
}));

import './add-music-together-demo-rsvp';

function run(data: unknown) {
  return mocks.capturedHandler!(data);
}

const validRsvp = {
  demoId: 'demo-1',
  name: 'Jamie Rivera',
  email: 'jamie@example.com',
};

describe('addMusicTogetherDemoRsvp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findById.mockResolvedValue({
      id: 'demo-1',
      visible: true,
      capacityFamilies: 8,
    });
    mocks.demoRsvpAdd.mockResolvedValue({
      created: true,
      entry: { status: 'confirmed' },
    });
  });

  it('confirms an RSVP under capacity (added=true, status=confirmed)', async () => {
    const result = (await run(validRsvp)) as {
      added: boolean;
      status: string;
    };
    expect(mocks.demoRsvpAdd).toHaveBeenCalledWith({
      demoId: 'demo-1',
      name: 'Jamie Rivera',
      email: 'jamie@example.com',
      capacityFamilies: 8,
    });
    expect(result).toEqual({ added: true, status: 'confirmed' });
  });

  it('waitlists an RSVP past capacity', async () => {
    mocks.demoRsvpAdd.mockResolvedValue({
      created: true,
      entry: { status: 'waitlisted' },
    });
    const result = (await run(validRsvp)) as { status: string };
    expect(result.status).toBe('waitlisted');
  });

  it('is idempotent — a repeat RSVP reports added=false with prior status', async () => {
    mocks.demoRsvpAdd.mockResolvedValue({
      created: false,
      entry: { status: 'waitlisted' },
    });
    const result = (await run(validRsvp)) as {
      added: boolean;
      status: string;
    };
    expect(result).toEqual({ added: false, status: 'waitlisted' });
  });

  it('rejects a missing demoId before touching the repository', async () => {
    await expect(run({ ...validRsvp, demoId: '' })).rejects.toThrow(/validation/);
    expect(mocks.findById).not.toHaveBeenCalled();
    expect(mocks.demoRsvpAdd).not.toHaveBeenCalled();
  });

  it('rejects an invalid email', async () => {
    await expect(run({ ...validRsvp, email: 'nope' })).rejects.toThrow(/validation/);
    expect(mocks.demoRsvpAdd).not.toHaveBeenCalled();
  });

  it('404s when the demo does not exist', async () => {
    mocks.findById.mockResolvedValue(undefined);
    await expect(run(validRsvp)).rejects.toThrow(/not found/);
    expect(mocks.demoRsvpAdd).not.toHaveBeenCalled();
  });

  it('rejects an RSVP to a hidden demo', async () => {
    mocks.findById.mockResolvedValue({
      id: 'demo-1',
      visible: false,
      capacityFamilies: 8,
    });
    await expect(run(validRsvp)).rejects.toThrow(/not open/);
    expect(mocks.demoRsvpAdd).not.toHaveBeenCalled();
  });
});
