import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  update: vi.fn(),
  hasErrors: false,
}));

vi.mock('@maple/firebase/functions', () => ({
  Role: {
    Admin: 'admin',
    MtTeacher: 'mt-teacher',
    Clerk: 'clerk',
    LessonTeacher: 'lesson-teacher',
  },
  createRoleFunction: (h: unknown) => h,
  throwNotFound: (entity: string, id: string) => {
    throw new Error(`${entity} not found: ${id}`);
  },
}));
vi.mock('@maple/firebase/database', () => ({
  MusicTogetherSemesterRepository: {
    findById: mocks.findById,
    update: mocks.update,
  },
}));
vi.mock('@maple/ts/validation', () => ({
  musicTogetherSemesterValidation: () => ({
    hasErrors: () => mocks.hasErrors,
    getErrors: () => ({ name: ['bad'] }),
  }),
}));

import { updateMusicTogetherSemester } from './update-music-together-semester';

const handler = updateMusicTogetherSemester as unknown as (
  d: unknown,
  c?: unknown
) => Promise<{ semester: unknown }>;

describe('updateMusicTogetherSemester', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasErrors = false;
    mocks.findById.mockResolvedValue({ id: 'sem-1', name: 'Old', season: 'fall', year: 2026 });
    mocks.update.mockImplementation(async (d) => ({ id: 'sem-1', ...d }));
  });

  it('updates an existing semester', async () => {
    const result = await handler({ id: 'sem-1', name: 'Fall 2026' }, {});
    expect(mocks.update).toHaveBeenCalledWith({ id: 'sem-1', name: 'Fall 2026' });
    expect(result.semester).toMatchObject({ id: 'sem-1', name: 'Fall 2026' });
  });

  it('404s an unknown semester', async () => {
    mocks.findById.mockResolvedValue(undefined);
    await expect(handler({ id: 'nope', name: 'X' }, {})).rejects.toThrow(/not found/i);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects when the merged record fails validation', async () => {
    mocks.hasErrors = true;
    await expect(handler({ id: 'sem-1', name: '' }, {})).rejects.toThrow(/Validation failed/);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
