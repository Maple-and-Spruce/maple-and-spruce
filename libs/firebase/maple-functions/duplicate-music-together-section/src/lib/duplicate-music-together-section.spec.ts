import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import type {
  MusicTogetherSection,
  CreateMusicTogetherSectionInput,
} from '@maple/ts/domain';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  create: vi.fn(),
}));

vi.mock('@maple/firebase/functions', async () => {
  const actual =
    await vi.importActual<typeof import('@maple/firebase/functions')>(
      '@maple/firebase/functions'
    );
  return {
    ...actual,
    createAdminFunction: <TReq, TRes>(
      handler: (data: TReq, ctx: unknown) => Promise<TRes>
    ) => handler,
  };
});

vi.mock('@maple/firebase/database', () => ({
  MusicTogetherSectionRepository: {
    findById: mocks.findById,
    create: mocks.create,
  },
}));

import { duplicateMusicTogetherSection } from './duplicate-music-together-section';

type Handler = (
  data: { sourceSectionId: string },
  ctx?: unknown
) => Promise<{ section: MusicTogetherSection }>;
const handler = duplicateMusicTogetherSection as unknown as Handler;

const source: MusicTogetherSection = {
  id: 'sec-source',
  name: 'Thursday 10:00 — Mixed Age',
  description: 'Fall 2026 term.',
  sessions: [
    { dateTime: new Date('2026-09-10T14:00:00Z') },
    { dateTime: new Date('2026-09-17T14:00:00Z') },
  ],
  capacityFamilies: 8,
  priceFullCents: 25200,
  installmentPlan: [
    { amountCents: 13200, dueAt: new Date('2026-09-10T14:00:00Z') },
    { amountCents: 13200, dueAt: new Date('2026-10-08T14:00:00Z') },
  ],
  visible: true,
  enrollmentActive: true,
  enrollmentOpensAt: new Date('2026-08-01T00:00:00Z'),
  enrollmentClosesAt: new Date('2026-09-09T00:00:00Z'),
  location: 'Maple & Spruce Studio',
  room: 'spruce',
  semesterId: 'sem-fall-2026',
  webflowItemId: 'webflow-original-id',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-04-01T00:00:00Z'),
};

describe('duplicateMusicTogetherSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a missing sourceSectionId', async () => {
    await expect(handler({ sourceSectionId: '' })).rejects.toThrow(HttpsError);
    expect(mocks.findById).not.toHaveBeenCalled();
  });

  it('throws not-found when the source section does not exist', async () => {
    mocks.findById.mockResolvedValue(undefined);
    await expect(handler({ sourceSectionId: 'nope' })).rejects.toThrow(
      HttpsError
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('clones into a hidden, paused draft with sessions copied', async () => {
    mocks.findById.mockResolvedValue(source);
    mocks.create.mockImplementation(
      async (input: CreateMusicTogetherSectionInput) => ({
        ...input,
        id: 'sec-copy',
        createdAt: new Date('2026-04-28T00:00:00Z'),
        updatedAt: new Date('2026-04-28T00:00:00Z'),
      })
    );

    const result = await handler({ sourceSectionId: 'sec-source' });

    expect(mocks.create).toHaveBeenCalledTimes(1);
    const created = mocks.create.mock
      .calls[0][0] as CreateMusicTogetherSectionInput;

    // Suffixed name + hidden/paused, dates cleared.
    expect(created.name).toBe('Thursday 10:00 — Mixed Age (Copy)');
    expect(created.visible).toBe(false);
    expect(created.enrollmentActive).toBe(false);
    expect(created.enrollmentOpensAt).toBeUndefined();
    expect(created.enrollmentClosesAt).toBeUndefined();

    // Sessions ARE copied (unlike duplicate-class) — deep-copied, not aliased.
    expect(created.sessions).toEqual(source.sessions);
    expect(created.sessions).not.toBe(source.sessions);

    // Configuration carried over.
    expect(created.description).toBe(source.description);
    expect(created.capacityFamilies).toBe(source.capacityFamilies);
    expect(created.priceFullCents).toBe(source.priceFullCents);
    expect(created.installmentPlan).toEqual(source.installmentPlan);
    expect(created.installmentPlan).not.toBe(source.installmentPlan);
    expect(created.location).toBe(source.location);
    expect(created.room).toBe(source.room);
    expect(created.semesterId).toBe(source.semesterId);

    // webflowItemId must not carry over (fresh sync creates a new item).
    expect(
      (created as unknown as Record<string, unknown>)['webflowItemId']
    ).toBeUndefined();

    expect(result.section.id).toBe('sec-copy');
    expect(result.section.name).toBe('Thursday 10:00 — Mixed Age (Copy)');
  });

  it('handles a source section with no installment plan', async () => {
    mocks.findById.mockResolvedValue({ ...source, installmentPlan: undefined });
    mocks.create.mockImplementation(
      async (input: CreateMusicTogetherSectionInput) => ({
        ...input,
        id: 'sec-copy',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );

    await handler({ sourceSectionId: 'sec-source' });

    const created = mocks.create.mock
      .calls[0][0] as CreateMusicTogetherSectionInput;
    expect(created.installmentPlan).toBeUndefined();
  });
});
