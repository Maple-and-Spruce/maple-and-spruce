import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ findAll: vi.fn() }));

vi.mock('@maple/firebase/functions', () => ({
  createAuthenticatedFunction: (h: unknown) => h,
}));
vi.mock('@maple/firebase/database', () => ({
  MusicTogetherSectionRepository: { findAll: mocks.findAll },
}));

import { getMusicTogetherSections } from './get-music-together-sections';

const handler = getMusicTogetherSections as unknown as (
  d: unknown,
  c?: unknown
) => Promise<{ sections: unknown[] }>;

describe('getMusicTogetherSections', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns sections, passing the status filter through', async () => {
    mocks.findAll.mockResolvedValue([{ id: 'sec-1' }]);
    const result = await handler({ status: 'open' }, {});
    expect(mocks.findAll).toHaveBeenCalledWith({ status: 'open' });
    expect(result.sections).toEqual([{ id: 'sec-1' }]);
  });

  it('works with no filter', async () => {
    mocks.findAll.mockResolvedValue([]);
    const result = await handler({}, {});
    expect(mocks.findAll).toHaveBeenCalledWith({ status: undefined });
    expect(result.sections).toEqual([]);
  });
});
