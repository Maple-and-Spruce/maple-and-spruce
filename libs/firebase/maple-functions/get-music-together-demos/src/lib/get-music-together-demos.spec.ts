import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  capturedHandler: null as ((d: unknown) => Promise<unknown>) | null,
  findAll: vi.fn(),
  countByDemoIdAndStatus: vi.fn(),
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
  MusicTogetherDemoRsvpRepository: {
    countByDemoIdAndStatus: mocks.countByDemoIdAndStatus,
  },
}));

import './get-music-together-demos';

describe('getMusicTogetherDemos', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns demos with per-demo confirmed/waitlisted counts', async () => {
    mocks.findAll.mockResolvedValue([
      { id: 'demo-1', location: 'Library', capacityFamilies: 2 },
      { id: 'demo-2', location: 'Studio', capacityFamilies: 8 },
    ]);
    mocks.countByDemoIdAndStatus.mockImplementation(
      async (demoId: string, status: string) => {
        if (demoId === 'demo-1' && status === 'confirmed') return 2;
        if (demoId === 'demo-1' && status === 'waitlisted') return 1;
        return 0;
      }
    );

    const result = (await mocks.capturedHandler!({})) as {
      demos: { id: string }[];
      counts: Record<string, { confirmed: number; waitlisted: number }>;
    };

    expect(result.demos).toHaveLength(2);
    expect(result.counts['demo-1']).toEqual({ confirmed: 2, waitlisted: 1 });
    // demo-2 has no RSVPs → omitted from counts.
    expect(result.counts['demo-2']).toBeUndefined();
  });
});
