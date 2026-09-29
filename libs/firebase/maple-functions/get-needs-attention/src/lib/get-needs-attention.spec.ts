import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Class, Instructor, NeedsAttentionGroup } from '@maple/ts/domain';

type Handler = (data: unknown, context: { uid?: string }) => Promise<{
  groups: NeedsAttentionGroup[];
  total: number;
  scopedToSelf: boolean;
}>;

const mocks = vi.hoisted(() => ({
  handler: null as Handler | null,
  hasRole: vi.fn(),
  instructorIdForUser: vi.fn(),
  instructorFindAll: vi.fn(),
  classFindAll: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => {
  const endpoint = {
    requiringRole: vi.fn(() => endpoint),
    handle: vi.fn((h: Handler) => {
      mocks.handler = h;
      return 'mock-fn';
    }),
  };
  return {
    Functions: { endpoint },
    Role: { Admin: 'admin', LessonTeacher: 'lesson-teacher' },
    hasRole: mocks.hasRole,
    instructorIdForUser: mocks.instructorIdForUser,
  };
});

vi.mock('@maple/firebase/database', () => {
  const empty = () => ({ findAll: vi.fn().mockResolvedValue([]) });
  return {
  StudentRepository: empty(),
  LessonRepository: empty(),
  LessonBlockRepository: empty(),
  InvoiceRepository: empty(),
  LessonScheduledChargeRepository: empty(),
  HopeSubmissionRepository: { findByLessonIds: vi.fn().mockResolvedValue(new Map()) },
  InstructorRepository: { findAll: mocks.instructorFindAll },
  ClassRepository: { findAll: mocks.classFindAll },
  };
});

import './get-needs-attention';

const soon = new Date(Date.now() + 3 * 86_400_000);

const uncleared: Instructor = {
  id: 'instructor-1',
  name: 'Robin Ashfield',
  email: 'robin@example.com',
  status: 'active',
  isContractor: true,
  readiness: { backgroundCheck: { clearedOn: '2026-09-10' } },
  createdAt: new Date(),
  updatedAt: new Date(),
};

const upcoming = {
  id: 'class-1',
  instructorId: 'instructor-1',
  status: 'published',
  sessions: [{ dateTime: soon }],
} as unknown as Class;

describe('getNeedsAttention: instructors not cleared to teach', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.instructorFindAll.mockResolvedValue([uncleared]);
    mocks.classFindAll.mockResolvedValue([upcoming]);
    mocks.instructorIdForUser.mockResolvedValue(undefined);
  });

  it('shows an admin the uncleared contractor with a class coming up', async () => {
    mocks.hasRole.mockResolvedValue(true);

    const result = await mocks.handler!({}, { uid: 'admin-uid' });

    expect(mocks.instructorFindAll).toHaveBeenCalledWith({ status: 'active' });
    expect(mocks.classFindAll).toHaveBeenCalledWith({ upcoming: true });
    const group = result.groups.find((g) => g.kind === 'instructor-not-ready');
    expect(group?.rows).toEqual([
      expect.objectContaining({
        kind: 'instructor-not-ready',
        id: 'instructor-1',
        label: 'Robin Ashfield',
        href: '/instructors?edit=instructor-1',
        resolution: 'navigate',
      }),
    ]);
    expect(group?.rows[0].detail).toMatch(
      /^Teaches .+ · missing contractor agreement and payment setup$/
    );
    expect(result.total).toBe(1);
  });

  it('neither reads nor shows it for a lesson teacher, even an unlinked one', async () => {
    mocks.hasRole.mockResolvedValue(false);

    const result = await mocks.handler!({}, { uid: 'teacher-uid' });

    expect(mocks.instructorFindAll).not.toHaveBeenCalled();
    expect(mocks.classFindAll).not.toHaveBeenCalled();
    expect(result.groups.map((g) => g.kind)).not.toContain('instructor-not-ready');
  });
});
