import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  capturedHandler: null as ((d: unknown) => Promise<unknown>) | null,
  findAll: vi.fn(),
  findByDemoId: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  createRoleFunction: (
    handler: typeof mocks.capturedHandler,
    _roles: unknown
  ) => {
    mocks.capturedHandler = handler;
    return 'mock-fn';
  },
  Role: { Admin: 'admin', MtTeacher: 'mt-teacher' },
}));

vi.mock('@maple/firebase/database', () => ({
  MusicTogetherDemoRepository: { findAll: mocks.findAll },
  MusicTogetherDemoRsvpRepository: { findByDemoId: mocks.findByDemoId },
}));

import './get-music-together-demo-rsvps';

describe('getMusicTogetherDemoRsvps', () => {
  beforeEach(() => vi.clearAllMocks());

  it('groups each demo with its confirmed + waitlisted RSVPs', async () => {
    mocks.findAll.mockResolvedValue([{ id: 'demo-1', location: 'Library' }]);
    mocks.findByDemoId.mockResolvedValue([
      { id: 'a@x.com', demoId: 'demo-1', status: 'confirmed', name: 'A' },
      { id: 'b@x.com', demoId: 'demo-1', status: 'waitlisted', name: 'B' },
      { id: 'c@x.com', demoId: 'demo-1', status: 'confirmed', name: 'C' },
    ]);

    const result = (await mocks.capturedHandler!({})) as {
      demos: {
        demo: { id: string };
        confirmed: { id: string }[];
        waitlisted: { id: string }[];
      }[];
    };

    expect(result.demos).toHaveLength(1);
    const group = result.demos[0];
    expect(group.demo.id).toBe('demo-1');
    expect(group.confirmed.map((r) => r.id)).toEqual(['a@x.com', 'c@x.com']);
    expect(group.waitlisted.map((r) => r.id)).toEqual(['b@x.com']);
  });
});
