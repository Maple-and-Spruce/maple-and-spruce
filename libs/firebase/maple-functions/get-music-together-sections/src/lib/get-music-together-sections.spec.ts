import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findAll: vi.fn(),
  regFindAll: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  Role: {
    Admin: 'admin',
    MtTeacher: 'mt-teacher',
    Clerk: 'clerk',
    LessonTeacher: 'lesson-teacher',
  },
  createRoleFunction: (h: unknown) => h,
}));
vi.mock('@maple/firebase/database', () => ({
  MusicTogetherSectionRepository: { findAll: mocks.findAll },
  MusicTogetherRegistrationRepository: { findAll: mocks.regFindAll },
}));

import { getMusicTogetherSections } from './get-music-together-sections';

const handler = getMusicTogetherSections as unknown as (
  d: unknown,
  c?: unknown
) => Promise<{
  sections: unknown[];
  counts: Record<string, { families: number; children: number }>;
}>;

describe('getMusicTogetherSections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.regFindAll.mockResolvedValue([]);
  });

  it('returns sections, passing the semester filter through', async () => {
    mocks.findAll.mockResolvedValue([{ id: 'sec-1' }]);
    const result = await handler({ semesterId: 'sem-1' }, {});
    expect(mocks.findAll).toHaveBeenCalledWith({ semesterId: 'sem-1' });
    expect(result.sections).toEqual([{ id: 'sec-1' }]);
  });

  it('works with no filter', async () => {
    mocks.findAll.mockResolvedValue([]);
    const result = await handler({}, {});
    expect(mocks.findAll).toHaveBeenCalledWith({ semesterId: undefined });
    expect(result.sections).toEqual([]);
  });

  it('counts registered families + children per section (capacity statuses only)', async () => {
    mocks.findAll.mockResolvedValue([{ id: 'sec-1' }, { id: 'sec-2' }]);
    mocks.regFindAll.mockResolvedValue([
      // sec-1: 2 confirmed families, 3 children total
      { sectionId: 'sec-1', status: 'confirmed', children: [{}, {}] },
      { sectionId: 'sec-1', status: 'confirmed', children: [{}] },
      // pending counts toward capacity too (1 more family, 1 child)
      { sectionId: 'sec-1', status: 'pending', children: [{}] },
      // cancelled / refunded do NOT count
      { sectionId: 'sec-1', status: 'cancelled', children: [{}, {}] },
      { sectionId: 'sec-1', status: 'refunded', children: [{}] },
      // sec-2: 1 confirmed family, 1 child
      { sectionId: 'sec-2', status: 'confirmed', children: [{}] },
      // registration for a section not in the result set is ignored
      { sectionId: 'sec-other', status: 'confirmed', children: [{}, {}] },
    ]);

    const result = await handler({}, {});

    expect(result.counts).toEqual({
      'sec-1': { families: 3, children: 4 },
      'sec-2': { families: 1, children: 1 },
    });
  });

  it('reports zero counts for a section with no registrations', async () => {
    mocks.findAll.mockResolvedValue([{ id: 'sec-empty' }]);
    mocks.regFindAll.mockResolvedValue([]);
    const result = await handler({}, {});
    expect(result.counts).toEqual({ 'sec-empty': { families: 0, children: 0 } });
  });
});
