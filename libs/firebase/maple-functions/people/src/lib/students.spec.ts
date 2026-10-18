import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The student handlers' read-own scoping: a lesson teacher sees and changes
 * only their own students. Create and update validation (including the
 * instruments rule) is covered in create-student.spec.ts and
 * update-student.spec.ts.
 */

const mocks = vi.hoisted(() => ({
  instructorScopeForUser: vi.fn(),
  assertOwnsAsInstructor: vi.fn(),
  assertCanManageStudent: vi.fn(),
  findAll: vi.fn(),
  findById: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  instructorScopeForUser: mocks.instructorScopeForUser,
  assertOwnsAsInstructor: mocks.assertOwnsAsInstructor,
  assertCanManageStudent: mocks.assertCanManageStudent,
  throwInvalidArgument: (m: string) => {
    throw new Error(m);
  },
  throwNotFound: (e: string, id: string) => {
    throw new Error(`${e} ${id} not found`);
  },
}));

vi.mock('@maple/firebase/database', () => ({
  StudentRepository: { findAll: mocks.findAll, findById: mocks.findById, delete: mocks.remove },
  InstrumentsConfigRepository: { get: vi.fn() },
}));

import { deleteStudent, getStudent, getStudents } from './students';

const context = { uid: 'caller' } as never;
const student = { id: 'stu-1', name: 'Test Student', primaryTeacherId: 'teacher-1' };

beforeEach(() => vi.clearAllMocks());

describe('getStudents', () => {
  it('lets an admin filter by any teacher', async () => {
    mocks.instructorScopeForUser.mockResolvedValue({ isAdmin: true });
    mocks.findAll.mockResolvedValue([student]);

    const result = await getStudents(
      { status: 'active', primaryTeacherId: 'teacher-9', isHopeScholarship: true } as never,
      context
    );

    expect(result).toEqual({ students: [student] });
    expect(mocks.findAll).toHaveBeenCalledWith({
      status: 'active',
      primaryTeacherId: 'teacher-9',
      isHopeScholarship: true,
    });
  });

  it("forces a lesson teacher to their own students, whatever they asked for", async () => {
    mocks.instructorScopeForUser.mockResolvedValue({ isAdmin: false, instructorId: 'teacher-1' });
    mocks.findAll.mockResolvedValue([student]);

    await getStudents({ primaryTeacherId: 'teacher-9' } as never, context);

    expect(mocks.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ primaryTeacherId: 'teacher-1' })
    );
  });

  it('gives a lesson teacher not linked to an instructor no students', async () => {
    mocks.instructorScopeForUser.mockResolvedValue({ isAdmin: false });

    await expect(getStudents({} as never, context)).resolves.toEqual({ students: [] });
    expect(mocks.findAll).not.toHaveBeenCalled();
  });
});

describe('getStudent', () => {
  it("checks the caller owns the student before returning it", async () => {
    mocks.findById.mockResolvedValue(student);

    await expect(getStudent({ id: 'stu-1' }, context)).resolves.toEqual({ student });
    expect(mocks.assertOwnsAsInstructor).toHaveBeenCalledWith(
      context,
      'teacher-1',
      'You can only view your own students.'
    );
  });

  it("refuses when the caller doesn't own the student", async () => {
    mocks.findById.mockResolvedValue(student);
    mocks.assertOwnsAsInstructor.mockRejectedValue(new Error('You can only view your own students.'));

    await expect(getStudent({ id: 'stu-1' }, context)).rejects.toThrow(/your own students/);
  });

  it('reports an unknown student', async () => {
    mocks.findById.mockResolvedValue(undefined);
    await expect(getStudent({ id: 'nope' }, context)).rejects.toThrow(/Student nope not found/);
  });
});

describe('deleteStudent', () => {
  it("deletes only after checking the caller may manage the student's teacher", async () => {
    mocks.findById.mockResolvedValue(student);

    await expect(deleteStudent({ id: 'stu-1' }, context)).resolves.toEqual({ success: true });
    expect(mocks.assertCanManageStudent).toHaveBeenCalledWith(context, 'teacher-1');
    expect(mocks.remove).toHaveBeenCalledWith('stu-1');
  });

  it("doesn't delete when the check refuses", async () => {
    mocks.findById.mockResolvedValue(student);
    mocks.assertCanManageStudent.mockRejectedValue(new Error('not your student'));

    await expect(deleteStudent({ id: 'stu-1' }, context)).rejects.toThrow(/not your student/);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('reports an unknown student', async () => {
    mocks.findById.mockResolvedValue(undefined);
    await expect(deleteStudent({ id: 'nope' }, context)).rejects.toThrow(/not found/);
  });
});
