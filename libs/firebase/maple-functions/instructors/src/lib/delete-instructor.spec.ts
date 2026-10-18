import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  Role: { Admin: 'admin', LessonTeacher: 'lesson-teacher' },
  hasRole: vi.fn(),
  throwNotFound: (entity: string, id: string) => {
    throw new Error(`${entity} ${id} not found`);
  },
}));

vi.mock('@maple/firebase/database', () => ({
  InstructorRepository: { findById: mocks.findById, delete: mocks.remove },
  InstrumentsConfigRepository: { get: vi.fn() },
}));

import { deleteInstructor } from './instructors';

describe('deleteInstructor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes an instructor that exists', async () => {
    mocks.findById.mockResolvedValue({ id: 'instructor-1' });

    await expect(deleteInstructor({ id: 'instructor-1' })).resolves.toEqual({
      success: true,
    });
    expect(mocks.remove).toHaveBeenCalledWith('instructor-1');
  });

  it('throws not-found, and deletes nothing, for an unknown id', async () => {
    mocks.findById.mockResolvedValue(undefined);

    await expect(deleteInstructor({ id: 'nope' })).rejects.toThrow(
      'Instructor nope not found'
    );
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
