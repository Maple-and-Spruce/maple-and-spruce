import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findByUid: vi.fn(),
  hasRole: vi.fn(),
}));

vi.mock('@maple/firebase/database', () => ({
  InstructorRepository: { findByUid: mocks.findByUid },
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
  instructorIdForUser,
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
