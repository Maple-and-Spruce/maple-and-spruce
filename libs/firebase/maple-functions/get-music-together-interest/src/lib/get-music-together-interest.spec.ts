import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  interestFindAll: vi.fn(),
  sectionFindAll: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  createAuthenticatedFunction: (h: unknown) => h,
}));
vi.mock('@maple/firebase/database', () => ({
  MusicTogetherInterestRepository: { findAll: mocks.interestFindAll },
  MusicTogetherSectionRepository: { findAll: mocks.sectionFindAll },
}));

import { getMusicTogetherInterest } from './get-music-together-interest';

const handler = getMusicTogetherInterest as unknown as (
  d: unknown,
  c?: unknown
) => Promise<{
  entries: unknown[];
  demand: { sectionId: string; count: number }[];
  sectionNames: Record<string, string>;
}>;

describe('getMusicTogetherInterest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns entries, a per-section demand tally, and section names', async () => {
    mocks.interestFindAll.mockResolvedValue([
      { id: 'a@x.com', interestedSectionIds: ['sec-1', 'sec-2'] },
      { id: 'b@x.com', interestedSectionIds: ['sec-1'] },
      { id: 'c@x.com', interestedSectionIds: [] },
    ]);
    mocks.sectionFindAll.mockResolvedValue([
      { id: 'sec-1', name: 'Thursdays 10am' },
      { id: 'sec-2', name: 'Saturdays 9am' },
    ]);

    const result = await handler({}, {});

    expect(result.entries).toHaveLength(3);
    expect(result.demand).toEqual([
      { sectionId: 'sec-1', count: 2 },
      { sectionId: 'sec-2', count: 1 },
    ]);
    expect(result.sectionNames).toEqual({
      'sec-1': 'Thursdays 10am',
      'sec-2': 'Saturdays 9am',
    });
  });

  it('handles an empty interest list', async () => {
    mocks.interestFindAll.mockResolvedValue([]);
    mocks.sectionFindAll.mockResolvedValue([]);
    const result = await handler({}, {});
    expect(result.entries).toEqual([]);
    expect(result.demand).toEqual([]);
    expect(result.sectionNames).toEqual({});
  });
});
