import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  capturedHandler: null as ((d: unknown) => Promise<unknown>) | null,
  sectionFindById: vi.fn(),
  interestUpsert: vi.fn(),
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
    throwValidationError: (errs: Record<string, string[]>) => {
      throw new HttpsError(
        'invalid-argument',
        `validation: ${Object.keys(errs).join(',')}`
      );
    },
  };
});

vi.mock('@maple/firebase/database', () => ({
  MusicTogetherSectionRepository: { findById: mocks.sectionFindById },
  MusicTogetherInterestRepository: { upsert: mocks.interestUpsert },
}));

import './add-music-together-interest';

function run(data: unknown) {
  return mocks.capturedHandler!(data);
}

const validEntry = {
  name: 'Jamie Rivera',
  email: 'jamie@example.com',
  interestedSectionIds: ['sec-1', 'sec-2'],
  preferenceNote: 'Thursdays please',
  alternateTimesNote: 'Saturday mornings',
  notes: 'Two kids',
};

describe('addMusicTogetherInterest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sectionFindById.mockResolvedValue({ id: 'sec', visible: true });
    mocks.interestUpsert.mockResolvedValue({ created: true });
  });

  it('records interest with the multi-section + preference fields', async () => {
    const result = (await run(validEntry)) as { added: boolean };
    expect(mocks.interestUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'jamie@example.com',
        interestedSectionIds: ['sec-1', 'sec-2'],
        preferenceNote: 'Thursdays please',
        alternateTimesNote: 'Saturday mornings',
        notes: 'Two kids',
      })
    );
    expect(result.added).toBe(true);
  });

  it('is idempotent — a repeat email reports added=false', async () => {
    mocks.interestUpsert.mockResolvedValue({ created: false });
    const result = (await run(validEntry)) as { added: boolean };
    expect(result.added).toBe(false);
  });

  it('de-dupes section ids before verifying + storing', async () => {
    await run({ ...validEntry, interestedSectionIds: ['sec-1', 'sec-1'] });
    expect(mocks.sectionFindById).toHaveBeenCalledTimes(1);
    expect(mocks.interestUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ interestedSectionIds: ['sec-1'] })
    );
  });

  it('allows an entry with no sections when alternate times are given', async () => {
    const result = (await run({
      name: 'No Fit',
      email: 'nofit@example.com',
      interestedSectionIds: [],
      alternateTimesNote: 'Weekday afternoons',
    })) as { added: boolean };
    expect(mocks.sectionFindById).not.toHaveBeenCalled();
    expect(result.added).toBe(true);
  });

  it('rejects an entirely blank interest signal before any write', async () => {
    await expect(
      run({ name: 'X', email: 'x@example.com', interestedSectionIds: [] })
    ).rejects.toThrow(/validation/);
    expect(mocks.interestUpsert).not.toHaveBeenCalled();
  });

  it('rejects invalid input before touching sections', async () => {
    await expect(run({ ...validEntry, email: 'nope' })).rejects.toThrow(
      /validation/
    );
    expect(mocks.sectionFindById).not.toHaveBeenCalled();
  });

  it('rejects an unknown / hidden section', async () => {
    mocks.sectionFindById.mockResolvedValue(undefined);
    await expect(run(validEntry)).rejects.toThrow(/not available/i);
    expect(mocks.interestUpsert).not.toHaveBeenCalled();
  });
});
