import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  capturedHandler: null as ((d: unknown) => Promise<unknown>) | null,
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
  };
});

vi.mock('@maple/firebase/database', () => ({
  MusicTogetherDemoRsvpRepository: { add: mocks.demoRsvpAdd },
}));

import './add-music-together-demo-rsvp';

function run(data: unknown) {
  return mocks.capturedHandler!(data);
}

const validRsvp = {
  demoSlot: 'Sat Aug 3 · 10:00 AM',
  name: 'Jamie Rivera',
  email: 'jamie@example.com',
};

describe('addMusicTogetherDemoRsvp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.demoRsvpAdd.mockResolvedValue({ created: true });
  });

  it('records a demo RSVP and reports added=true', async () => {
    const result = (await run(validRsvp)) as { added: boolean };
    expect(mocks.demoRsvpAdd).toHaveBeenCalledWith({
      demoSlot: 'Sat Aug 3 · 10:00 AM',
      name: 'Jamie Rivera',
      email: 'jamie@example.com',
    });
    expect(result.added).toBe(true);
  });

  it('is idempotent — a repeat email (new slot) reports added=false', async () => {
    mocks.demoRsvpAdd.mockResolvedValue({ created: false });
    const result = (await run({
      ...validRsvp,
      demoSlot: 'Sun Aug 4 · 9:00 AM',
    })) as { added: boolean };
    expect(mocks.demoRsvpAdd).toHaveBeenCalledWith(
      expect.objectContaining({ demoSlot: 'Sun Aug 4 · 9:00 AM' })
    );
    expect(result.added).toBe(false);
  });

  it('rejects a missing slot before touching the repository', async () => {
    await expect(run({ ...validRsvp, demoSlot: '' })).rejects.toThrow(
      /validation/
    );
    expect(mocks.demoRsvpAdd).not.toHaveBeenCalled();
  });

  it('rejects a missing name', async () => {
    await expect(run({ ...validRsvp, name: '' })).rejects.toThrow(/validation/);
    expect(mocks.demoRsvpAdd).not.toHaveBeenCalled();
  });

  it('rejects an invalid email', async () => {
    await expect(run({ ...validRsvp, email: 'nope' })).rejects.toThrow(
      /validation/
    );
    expect(mocks.demoRsvpAdd).not.toHaveBeenCalled();
  });
});
