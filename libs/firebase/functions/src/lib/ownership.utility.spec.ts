import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findByUid: vi.fn(),
  findLessonById: vi.fn(),
  hasRole: vi.fn(),
}));

vi.mock('@maple/firebase/database', () => ({
  InstructorRepository: { findByUid: mocks.findByUid },
  LessonRepository: { findById: mocks.findLessonById },
}));

vi.mock('./auth.utility', () => ({
  Role: {
    Admin: 'admin',
    MtTeacher: 'mt-teacher',
    Clerk: 'clerk',
    LessonTeacher: 'lesson-teacher',
  },
  hasRole: mocks.hasRole,
}));

import {
  assertCanManageLesson,
  assertCanManageStudent,
  assertCanRecordInvoicePayment,
  instructorIdForUser,
  instructorScopeForUser,
} from './ownership.utility';

describe('instructorIdForUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the linked instructor id', async () => {
    mocks.findByUid.mockResolvedValue({ id: 'instr-1', uid: 'nathan-uid' });
    expect(await instructorIdForUser('nathan-uid')).toBe('instr-1');
  });

  it('returns undefined for an unlinked user', async () => {
    mocks.findByUid.mockResolvedValue(undefined);
    expect(await instructorIdForUser('someone')).toBeUndefined();
  });

  it('returns undefined (without querying) for a missing uid', async () => {
    expect(await instructorIdForUser(undefined)).toBeUndefined();
    expect(mocks.findByUid).not.toHaveBeenCalled();
  });
});

describe('assertCanManageLesson', () => {
  beforeEach(() => vi.clearAllMocks());

  it('admins pass unconditionally, without resolving an instructor', async () => {
    mocks.hasRole.mockResolvedValue(true);
    await expect(
      assertCanManageLesson({ uid: 'admin-uid' }, 'instr-someone')
    ).resolves.toBeUndefined();
    expect(mocks.findByUid).not.toHaveBeenCalled();
  });

  it('a lesson teacher passes for a lesson they teach', async () => {
    mocks.hasRole.mockResolvedValue(false);
    mocks.findByUid.mockResolvedValue({ id: 'instr-nathan' });
    await expect(
      assertCanManageLesson({ uid: 'nathan-uid' }, 'instr-nathan')
    ).resolves.toBeUndefined();
  });

  it("denies a lesson teacher for someone else's lesson", async () => {
    mocks.hasRole.mockResolvedValue(false);
    mocks.findByUid.mockResolvedValue({ id: 'instr-nathan' });
    await expect(
      assertCanManageLesson({ uid: 'nathan-uid' }, 'instr-someone-else')
    ).rejects.toThrow(/only manage lessons you teach/i);
  });

  it('denies an unlinked caller (no instructor record)', async () => {
    mocks.hasRole.mockResolvedValue(false);
    mocks.findByUid.mockResolvedValue(undefined);
    await expect(
      assertCanManageLesson({ uid: 'unlinked-uid' }, 'instr-nathan')
    ).rejects.toThrow(/only manage lessons you teach/i);
  });

  it('denies when the owner is undefined (e.g. create with no teacherId)', async () => {
    mocks.hasRole.mockResolvedValue(false);
    mocks.findByUid.mockResolvedValue({ id: 'instr-nathan' });
    await expect(
      assertCanManageLesson({ uid: 'nathan-uid' }, undefined)
    ).rejects.toThrow(/only manage lessons you teach/i);
  });
});

describe('assertCanRecordInvoicePayment', () => {
  beforeEach(() => vi.clearAllMocks());

  const invoiceForLesson = (lessonId: string) => ({
    lineItems: [{ lessonId }],
  });

  it('admins pass unconditionally, without resolving lessons', async () => {
    mocks.hasRole.mockResolvedValue(true);
    await expect(
      assertCanRecordInvoicePayment({ uid: 'admin-uid' }, invoiceForLesson('les-1'))
    ).resolves.toBeUndefined();
    expect(mocks.findByUid).not.toHaveBeenCalled();
    expect(mocks.findLessonById).not.toHaveBeenCalled();
  });

  it('a teacher passes when the invoice references a lesson they teach', async () => {
    mocks.hasRole.mockResolvedValue(false);
    mocks.findByUid.mockResolvedValue({ id: 'instr-nathan' });
    mocks.findLessonById.mockResolvedValue({
      id: 'les-1',
      teacherId: 'instr-nathan',
    });
    await expect(
      assertCanRecordInvoicePayment({ uid: 'nathan-uid' }, invoiceForLesson('les-1'))
    ).resolves.toBeUndefined();
  });

  it("denies a teacher when the invoice's lesson is someone else's", async () => {
    mocks.hasRole.mockResolvedValue(false);
    mocks.findByUid.mockResolvedValue({ id: 'instr-nathan' });
    mocks.findLessonById.mockResolvedValue({
      id: 'les-1',
      teacherId: 'instr-other',
    });
    await expect(
      assertCanRecordInvoicePayment({ uid: 'nathan-uid' }, invoiceForLesson('les-1'))
    ).rejects.toThrow(/only record payments on your own students/i);
  });

  it('denies a teacher on a free-form invoice (no lesson-linked line)', async () => {
    mocks.hasRole.mockResolvedValue(false);
    mocks.findByUid.mockResolvedValue({ id: 'instr-nathan' });
    await expect(
      assertCanRecordInvoicePayment(
        { uid: 'nathan-uid' },
        { lineItems: [{ lessonId: undefined }] }
      )
    ).rejects.toThrow(/only record payments on your own students/i);
    expect(mocks.findLessonById).not.toHaveBeenCalled();
  });

  it('denies an unlinked caller', async () => {
    mocks.hasRole.mockResolvedValue(false);
    mocks.findByUid.mockResolvedValue(undefined);
    await expect(
      assertCanRecordInvoicePayment({ uid: 'nobody' }, invoiceForLesson('les-1'))
    ).rejects.toThrow(/only record payments on your own students/i);
  });
});

describe('assertCanManageStudent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('admins pass unconditionally', async () => {
    mocks.hasRole.mockResolvedValue(true);
    await expect(
      assertCanManageStudent({ uid: 'admin-uid' }, 'instr-someone')
    ).resolves.toBeUndefined();
    expect(mocks.findByUid).not.toHaveBeenCalled();
  });

  it('a lesson teacher passes for their own student', async () => {
    mocks.hasRole.mockResolvedValue(false);
    mocks.findByUid.mockResolvedValue({ id: 'instr-nathan' });
    await expect(
      assertCanManageStudent({ uid: 'nathan-uid' }, 'instr-nathan')
    ).resolves.toBeUndefined();
  });

  it("denies another teacher's student", async () => {
    mocks.hasRole.mockResolvedValue(false);
    mocks.findByUid.mockResolvedValue({ id: 'instr-nathan' });
    await expect(
      assertCanManageStudent({ uid: 'nathan-uid' }, 'instr-other')
    ).rejects.toThrow(/only manage your own students/i);
  });
});

describe('instructorScopeForUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('admin: isAdmin true, no instructor lookup', async () => {
    mocks.hasRole.mockResolvedValue(true);
    const scope = await instructorScopeForUser({ uid: 'admin-uid' });
    expect(scope).toEqual({ isAdmin: true, instructorId: undefined });
    expect(mocks.findByUid).not.toHaveBeenCalled();
  });

  it('linked lesson teacher: their instructor id', async () => {
    mocks.hasRole.mockResolvedValue(false);
    mocks.findByUid.mockResolvedValue({ id: 'instr-nathan' });
    const scope = await instructorScopeForUser({ uid: 'nathan-uid' });
    expect(scope).toEqual({ isAdmin: false, instructorId: 'instr-nathan' });
  });

  it('unlinked non-admin: undefined instructor id', async () => {
    mocks.hasRole.mockResolvedValue(false);
    mocks.findByUid.mockResolvedValue(undefined);
    const scope = await instructorScopeForUser({ uid: 'unlinked' });
    expect(scope).toEqual({ isAdmin: false, instructorId: undefined });
  });
});
