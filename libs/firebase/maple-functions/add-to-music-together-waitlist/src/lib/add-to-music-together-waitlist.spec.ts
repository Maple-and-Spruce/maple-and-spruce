import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  capturedHandler: null as ((d: unknown) => Promise<unknown>) | null,
  sectionFindById: vi.fn(),
  waitlistAdd: vi.fn(),
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
    throwInvalidArgument: (m: string) => {
      throw new HttpsError('invalid-argument', m);
    },
    throwNotFound: (e: string, id: string) => {
      throw new HttpsError('not-found', `${e} not found: ${id}`);
    },
    throwValidationError: (errs: Record<string, string[]>) => {
      throw new HttpsError('invalid-argument', `validation: ${Object.keys(errs).join(',')}`);
    },
  };
});

vi.mock('@maple/firebase/database', () => ({
  MusicTogetherSectionRepository: { findById: mocks.sectionFindById },
  MusicTogetherWaitlistRepository: { add: mocks.waitlistAdd },
}));

import './add-to-music-together-waitlist';

function run(data: unknown) {
  return mocks.capturedHandler!(data);
}

const validEntry = {
  sectionId: 'sec-1',
  name: 'Jamie Rivera',
  email: 'jamie@example.com',
  availability: 'Tuesday mornings',
};

describe('addToMusicTogetherWaitlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sectionFindById.mockResolvedValue({ id: 'sec-1', status: 'closed' });
    mocks.waitlistAdd.mockResolvedValue({ created: true });
  });

  it('adds a family to the waitlist and reports added=true', async () => {
    const result = (await run(validEntry)) as { added: boolean };
    expect(mocks.waitlistAdd).toHaveBeenCalledWith(
      expect.objectContaining({ sectionId: 'sec-1', email: 'jamie@example.com' })
    );
    expect(result.added).toBe(true);
  });

  it('is idempotent — a repeat email reports added=false', async () => {
    mocks.waitlistAdd.mockResolvedValue({ created: false });
    const result = (await run(validEntry)) as { added: boolean };
    expect(result.added).toBe(false);
  });

  it('works for an open section too (no capacity gate)', async () => {
    mocks.sectionFindById.mockResolvedValue({ id: 'sec-1', status: 'open' });
    const result = (await run(validEntry)) as { added: boolean };
    expect(result.added).toBe(true);
  });

  it('rejects invalid input before touching the section', async () => {
    await expect(run({ ...validEntry, email: 'nope' })).rejects.toThrow(/validation/);
    expect(mocks.sectionFindById).not.toHaveBeenCalled();
  });

  it('404s an unknown section', async () => {
    mocks.sectionFindById.mockResolvedValue(undefined);
    await expect(run(validEntry)).rejects.toThrow(/not found/i);
    expect(mocks.waitlistAdd).not.toHaveBeenCalled();
  });

  it('rejects a draft section', async () => {
    mocks.sectionFindById.mockResolvedValue({ id: 'sec-1', status: 'draft' });
    await expect(run(validEntry)).rejects.toThrow(/not available/i);
  });
});
