import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ findAll: vi.fn() }));

vi.mock('@maple/firebase/functions', () => ({
  createAuthenticatedFunction: (h: unknown) => h,
}));
vi.mock('@maple/firebase/database', () => ({
  MusicTogetherSemesterRepository: { findAll: mocks.findAll },
}));

import { getMusicTogetherSemesters } from './get-music-together-semesters';

const handler = getMusicTogetherSemesters as unknown as (
  d: unknown,
  c?: unknown
) => Promise<{ semesters: unknown[] }>;

describe('getMusicTogetherSemesters', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns semesters, passing the status filter through', async () => {
    mocks.findAll.mockResolvedValue([{ id: 'sem-1' }]);
    const result = await handler({ status: 'enrolling' }, {});
    expect(mocks.findAll).toHaveBeenCalledWith({ status: 'enrolling' });
    expect(result.semesters).toEqual([{ id: 'sem-1' }]);
  });

  it('works with no filter', async () => {
    mocks.findAll.mockResolvedValue([]);
    const result = await handler({}, {});
    expect(mocks.findAll).toHaveBeenCalledWith({ status: undefined });
    expect(result.semesters).toEqual([]);
  });
});
