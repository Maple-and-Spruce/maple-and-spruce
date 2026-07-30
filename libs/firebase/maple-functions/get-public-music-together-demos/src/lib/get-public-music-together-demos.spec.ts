import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  capturedHandler: null as ((d: unknown) => Promise<unknown>) | null,
  findUpcomingVisible: vi.fn(),
  countByDemoIdAndStatus: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => {
  const endpoint = {
    withOptions: vi.fn(() => endpoint),
    handle: vi.fn((h: typeof mocks.capturedHandler) => {
      mocks.capturedHandler = h;
      return 'mock-fn';
    }),
  };
  return { Functions: { endpoint } };
});
vi.mock('@maple/firebase/database', () => ({
  MusicTogetherDemoRepository: {
    findUpcomingVisible: mocks.findUpcomingVisible,
  },
  MusicTogetherDemoRsvpRepository: {
    countByDemoIdAndStatus: mocks.countByDemoIdAndStatus,
  },
}));

import './get-public-music-together-demos';

function run(data: unknown) {
  return mocks.capturedHandler!(data);
}

describe('getPublicMusicTogetherDemos', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns customer-safe demos with spotsRemaining + isFull (no PII)', async () => {
    mocks.findUpcomingVisible.mockResolvedValue([
      {
        id: 'demo-1',
        dateTime: new Date('2030-08-03T14:00:00Z'),
        location: 'Library',
        capacityFamilies: 5,
        durationMinutes: 30,
        visible: true,
      },
      {
        id: 'demo-2',
        dateTime: new Date('2030-08-04T13:00:00Z'),
        location: 'Studio',
        capacityFamilies: 2,
        visible: true,
      },
    ]);
    // Both demos have 2 confirmed families (demo-1 cap 5 → 3 left; demo-2 cap 2 → full).
    mocks.countByDemoIdAndStatus.mockResolvedValue(2);

    const result = (await run({})) as {
      demos: {
        id: string;
        dateTime: string;
        location: string;
        durationMinutes: number;
        spotsRemaining: number;
        isFull: boolean;
      }[];
    };

    expect(result.demos).toHaveLength(2);
    expect(result.demos[0]).toEqual({
      id: 'demo-1',
      dateTime: '2030-08-03T14:00:00.000Z',
      location: 'Library',
      durationMinutes: 30,
      spotsRemaining: 3,
      isFull: false,
    });
    // demo-2: 2 confirmed of 2 → full, no spots. Duration falls back to 45.
    expect(result.demos[1]).toMatchObject({
      id: 'demo-2',
      durationMinutes: 45,
      spotsRemaining: 0,
      isFull: true,
    });
    // No RSVP names/emails leak into the response.
    expect(JSON.stringify(result)).not.toMatch(/@/);
  });
});
