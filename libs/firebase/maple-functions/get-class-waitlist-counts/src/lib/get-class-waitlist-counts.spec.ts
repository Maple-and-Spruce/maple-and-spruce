import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  countsByClass: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  Role: {
    Admin: 'admin',
    MtTeacher: 'mt-teacher',
    Clerk: 'clerk',
    LessonTeacher: 'lesson-teacher',
  },
  createRoleFunction: <Req, Res>(handler: (data: Req) => Promise<Res>) =>
    handler,
}));

vi.mock('@maple/firebase/database', () => ({
  ClassWaitlistRepository: {
    countsByClass: mocks.countsByClass,
  },
}));

import { getClassWaitlistCounts } from './get-class-waitlist-counts';

const handler = getClassWaitlistCounts as unknown as (
  data: Record<string, never>
) => Promise<{ counts: Record<string, number> }>;

describe('getClassWaitlistCounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the repository counts map verbatim', async () => {
    mocks.countsByClass.mockResolvedValue({ 'class-1': 3, 'class-2': 1 });

    const result = await handler({});

    expect(mocks.countsByClass).toHaveBeenCalledOnce();
    expect(result).toEqual({ counts: { 'class-1': 3, 'class-2': 1 } });
  });

  it('returns an empty map when no class has a waitlist', async () => {
    mocks.countsByClass.mockResolvedValue({});

    const result = await handler({});

    expect(result).toEqual({ counts: {} });
  });
});
