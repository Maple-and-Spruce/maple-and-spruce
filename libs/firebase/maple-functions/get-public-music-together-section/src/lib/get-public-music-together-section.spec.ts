import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  capturedHandler: null as ((d: unknown) => Promise<unknown>) | null,
  findById: vi.fn(),
  countBySectionId: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => {
  const endpoint = {
    withOptions: vi.fn(() => endpoint),
    handle: vi.fn((h: typeof mocks.capturedHandler) => {
      mocks.capturedHandler = h;
      return 'mock-function';
    }),
  };
  return { Functions: { endpoint } };
});

vi.mock('@maple/firebase/database', () => ({
  MusicTogetherSectionRepository: { findById: mocks.findById },
  MusicTogetherRegistrationRepository: {
    countBySectionId: mocks.countBySectionId,
  },
}));

import './get-public-music-together-section';

function run(data: unknown) {
  return mocks.capturedHandler!(data);
}

const section = {
  id: 'sec-1',
  name: 'Spring 2026',
  description: 'Tuesdays 10am',
  visible: true,
  enrollmentActive: true,
  capacityFamilies: 8,
  priceFullCents: 25200,
  sessions: [{ dateTime: new Date('2026-09-01T14:00:00Z') }],
  installmentPlan: [
    { amountCents: 13200, dueAt: new Date('2026-09-01T14:00:00Z') },
    { amountCents: 13200, dueAt: new Date('2026-09-29T14:00:00Z') },
  ],
  location: 'Studio',
  room: 'spruce',
};

describe('getPublicMusicTogetherSection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a public projection with computed spotsRemaining and ISO dates', async () => {
    mocks.findById.mockResolvedValue(section);
    mocks.countBySectionId.mockResolvedValue(3);

    const result = (await run({ sectionId: 'sec-1' })) as {
      section: {
        spotsRemaining: number;
        sessions: { dateTime: string }[];
        installmentPlan?: { dueAt: string }[];
        priceFullCents: number;
      };
    };

    expect(result.section.spotsRemaining).toBe(5); // 8 - 3
    expect(result.section.sessions[0].dateTime).toBe('2026-09-01T14:00:00.000Z');
    expect(result.section.installmentPlan?.[1].dueAt).toBe(
      '2026-09-29T14:00:00.000Z'
    );
    expect(result.section.priceFullCents).toBe(25200);
  });

  it('reports 0 spots when full', async () => {
    mocks.findById.mockResolvedValue(section);
    mocks.countBySectionId.mockResolvedValue(8);
    const result = (await run({ sectionId: 'sec-1' })) as {
      section: { spotsRemaining: number };
    };
    expect(result.section.spotsRemaining).toBe(0);
  });

  it('requires a section id', async () => {
    await expect(run({})).rejects.toThrow(/required/i);
    expect(mocks.findById).not.toHaveBeenCalled();
  });

  it('404s an unknown section', async () => {
    mocks.findById.mockResolvedValue(undefined);
    await expect(run({ sectionId: 'nope' })).rejects.toThrow(/not found/i);
  });

  it('hides sections that are not visible', async () => {
    mocks.findById.mockResolvedValue({ ...section, visible: false });
    await expect(run({ sectionId: 'sec-1' })).rejects.toThrow(
      /not available/i
    );
    expect(mocks.countBySectionId).not.toHaveBeenCalled();
  });

  it('reports enrollmentOpen from the live controls', async () => {
    mocks.findById.mockResolvedValue(section);
    mocks.countBySectionId.mockResolvedValue(3);
    const result = (await run({ sectionId: 'sec-1' })) as {
      section: { enrollmentOpen: boolean };
    };
    expect(result.section.enrollmentOpen).toBe(true);
  });

  it('reports enrollmentOpen=false when enrollment is paused', async () => {
    mocks.findById.mockResolvedValue({ ...section, enrollmentActive: false });
    mocks.countBySectionId.mockResolvedValue(3);
    const result = (await run({ sectionId: 'sec-1' })) as {
      section: { enrollmentOpen: boolean };
    };
    expect(result.section.enrollmentOpen).toBe(false);
  });
});
