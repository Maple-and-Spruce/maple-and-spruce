import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  demoRsvpFindAll: vi.fn(),
  capturedRoles: null as unknown[] | null,
}));

vi.mock('@maple/firebase/functions', () => ({
  Role: {
    Admin: 'admin',
    MtTeacher: 'mt-teacher',
    Clerk: 'clerk',
    LessonTeacher: 'lesson-teacher',
  },
  createRoleFunction: (h: unknown, roles: unknown[]) => {
    mocks.capturedRoles = roles;
    return h;
  },
}));
vi.mock('@maple/firebase/database', () => ({
  MusicTogetherDemoRsvpRepository: { findAll: mocks.demoRsvpFindAll },
}));

import { getMusicTogetherDemoRsvps } from './get-music-together-demo-rsvps';

const handler = getMusicTogetherDemoRsvps as unknown as (
  d: unknown,
  c?: unknown
) => Promise<{ rsvps: { email: string; demoSlot: string }[] }>;

describe('getMusicTogetherDemoRsvps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all demo RSVPs from the repository', async () => {
    mocks.demoRsvpFindAll.mockResolvedValue([
      { id: 'a@example.com', email: 'a@example.com', demoSlot: 'Sat 10am' },
      { id: 'b@example.com', email: 'b@example.com', demoSlot: 'Sun 9am' },
    ]);

    const result = await handler({}, {});

    expect(mocks.demoRsvpFindAll).toHaveBeenCalled();
    expect(result.rsvps).toHaveLength(2);
    expect(result.rsvps.map((r) => r.email)).toEqual([
      'a@example.com',
      'b@example.com',
    ]);
  });

  it('returns an empty list when there are no RSVPs', async () => {
    mocks.demoRsvpFindAll.mockResolvedValue([]);
    const result = await handler({}, {});
    expect(result.rsvps).toEqual([]);
  });

  it('is gated to Admin + MtTeacher', () => {
    expect(mocks.capturedRoles).toEqual(['admin', 'mt-teacher']);
  });
});
