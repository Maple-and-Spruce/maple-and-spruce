import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findByClassId: vi.fn(),
}));

// createAdminFunction wraps the handler with auth/role plumbing we don't want
// in a unit test — stub it to return the raw handler and surface the thrown
// HttpsError codes verbatim.
vi.mock('@maple/firebase/functions', () => ({
  Role: {
    Admin: 'admin',
    MtTeacher: 'mt-teacher',
    Clerk: 'clerk',
    LessonTeacher: 'lesson-teacher',
  },
  createRoleFunction: <Req, Res>(handler: (data: Req) => Promise<Res>) =>
    handler,
  throwInvalidArgument: (message: string) => {
    throw new Error(`invalid-argument: ${message}`);
  },
}));

vi.mock('@maple/firebase/database', () => ({
  ClassWaitlistRepository: {
    findByClassId: mocks.findByClassId,
  },
}));

import { getClassWaitlist } from './get-class-waitlist';

const handler = getClassWaitlist as unknown as (data: {
  classId: string;
}) => Promise<{ entries: { email: string }[]; count: number }>;

describe('getClassWaitlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires a classId', async () => {
    await expect(handler({ classId: '' })).rejects.toThrow('invalid-argument');
    expect(mocks.findByClassId).not.toHaveBeenCalled();
  });

  it('returns entries ordered by signup time with a count', async () => {
    mocks.findByClassId.mockResolvedValue([
      {
        id: 'bob@example.com',
        classId: 'class-1',
        email: 'bob@example.com',
        createdAt: new Date('2026-07-02T10:00:00Z'),
      },
      {
        id: 'alice@example.com',
        classId: 'class-1',
        email: 'alice@example.com',
        createdAt: new Date('2026-07-01T10:00:00Z'),
      },
    ]);

    const result = await handler({ classId: 'class-1' });

    expect(mocks.findByClassId).toHaveBeenCalledWith('class-1');
    expect(result.count).toBe(2);
    // Alice signed up first, so she sorts ahead of Bob.
    expect(result.entries.map((e) => e.email)).toEqual([
      'alice@example.com',
      'bob@example.com',
    ]);
  });

  it('returns an empty list and zero count when nobody is waitlisted', async () => {
    mocks.findByClassId.mockResolvedValue([]);

    const result = await handler({ classId: 'class-1' });

    expect(result).toEqual({ entries: [], count: 0 });
  });
});
