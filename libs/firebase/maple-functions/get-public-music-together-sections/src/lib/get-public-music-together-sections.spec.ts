import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  capturedHandler: null as ((d: unknown) => Promise<unknown>) | null,
  findAll: vi.fn(),
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
  MusicTogetherSectionRepository: { findAll: mocks.findAll },
}));

import './get-public-music-together-sections';

function run(data: unknown) {
  return mocks.capturedHandler!(data);
}

const future = new Date(Date.now() + 30 * 86_400_000);

describe('getPublicMusicTogetherSections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns visible sections as customer-safe options with ISO first-session', async () => {
    mocks.findAll.mockResolvedValue([
      {
        id: 'sec-1',
        name: 'Thursdays 10am',
        visible: true,
        enrollmentActive: true,
        capacityFamilies: 8,
        location: 'Studio A',
        sessions: [{ dateTime: future }],
      },
    ]);

    const result = (await run({})) as {
      sections: { id: string; name: string; firstSessionAt?: string }[];
    };

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]).toMatchObject({
      id: 'sec-1',
      name: 'Thursdays 10am',
      location: 'Studio A',
    });
    expect(typeof result.sections[0].firstSessionAt).toBe('string');
  });

  it('hides draft (not visible) sections', async () => {
    mocks.findAll.mockResolvedValue([
      { id: 'draft', name: 'Hidden', visible: false, sessions: [] },
      {
        id: 'shown',
        name: 'Shown',
        visible: true,
        enrollmentActive: false,
        capacityFamilies: 8,
        sessions: [{ dateTime: future }],
      },
    ]);
    const result = (await run({})) as { sections: { id: string }[] };
    expect(result.sections.map((s) => s.id)).toEqual(['shown']);
  });

  it('passes the semester filter through', async () => {
    mocks.findAll.mockResolvedValue([]);
    await run({ semesterId: 'sem-1' });
    expect(mocks.findAll).toHaveBeenCalledWith({ semesterId: 'sem-1' });
  });
});
