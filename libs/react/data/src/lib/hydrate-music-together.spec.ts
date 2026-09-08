import { describe, it, expect } from 'vitest';
import {
  mtSectionFirstSessionAt,
  mtRefundCents,
  type MusicTogetherSection,
} from '@maple/ts/domain';
import { hydrateMusicTogetherSection } from './hydrate-music-together';

/**
 * The fixture here is deliberately the WIRE shape, not the domain type: a
 * callable serializes every Date to an ISO string, so this is what actually
 * arrives in the browser. The cast is the point of the test — the previous
 * roster-dialog crash was invisible to TypeScript precisely because the
 * declared type says Date while the runtime value is a string.
 */
function wireSection(): MusicTogetherSection {
  return {
    id: 'sec-1',
    name: 'Thursday Morning — Mixed Age (0–5)',
    sessions: [
      { dateTime: '2026-09-17T14:00:00.000Z' },
      { dateTime: '2026-09-10T14:00:00.000Z' },
    ],
    capacityFamilies: 8,
    priceFullCents: 25200,
    installmentPlan: [
      { amountCents: 13200, dueAt: '2026-09-10T14:00:00.000Z' },
      { amountCents: 13200, dueAt: '2026-10-08T14:00:00.000Z' },
    ],
    visible: true,
    enrollmentActive: true,
    enrollmentOpensAt: '2026-08-01T00:00:00.000Z',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  } as unknown as MusicTogetherSection;
}

describe('hydrateMusicTogetherSection', () => {
  it('turns every serialized date into a real Date', () => {
    const s = hydrateMusicTogetherSection(wireSection());

    expect(s.sessions.every((x) => x.dateTime instanceof Date)).toBe(true);
    expect(s.installmentPlan?.every((x) => x.dueAt instanceof Date)).toBe(true);
    expect(s.createdAt).toBeInstanceOf(Date);
    expect(s.updatedAt).toBeInstanceOf(Date);
    expect(s.enrollmentOpensAt).toBeInstanceOf(Date);
  });

  it('leaves an absent optional date absent rather than Invalid Date', () => {
    const s = hydrateMusicTogetherSection(wireSection());

    // enrollmentClosesAt was not set; `new Date(undefined)` would be an
    // Invalid Date, which reads as "closes at ???" rather than "never closes".
    expect(s.enrollmentClosesAt).toBeUndefined();
  });

  it('survives a section with no sessions', () => {
    const bare = { ...wireSection(), sessions: undefined };
    const s = hydrateMusicTogetherSection(
      bare as unknown as MusicTogetherSection
    );

    expect(s.sessions).toEqual([]);
  });

  it('preserves non-date fields', () => {
    const s = hydrateMusicTogetherSection(wireSection());

    expect(s.name).toBe('Thursday Morning — Mixed Age (0–5)');
    expect(s.priceFullCents).toBe(25200);
    expect(s.installmentPlan?.map((i) => i.amountCents)).toEqual([13200, 13200]);
  });
});

/**
 * THE REGRESSION. An unhydrated section crashed the admin app when an admin
 * clicked Cancel / refund on the roster.
 */
describe('refund policy on a callable-returned section', () => {
  it('throws on the raw wire shape — the crash, reproduced', () => {
    const raw = wireSection();

    // `mtSectionFirstSessionAt` compares with `<`, which works on ISO strings,
    // so it returns a STRING while its signature promises Date | undefined.
    const first = mtSectionFirstSessionAt(raw);
    expect(typeof (first as unknown)).toBe('string');

    // ...and mtRefundCents then calls .getTime() on it.
    expect(() => mtRefundCents(13200, first, new Date())).toThrow(TypeError);
  });

  it('computes the policy refund once hydrated', () => {
    const s = hydrateMusicTogetherSection(wireSection());
    const first = mtSectionFirstSessionAt(s);

    expect(first).toBeInstanceOf(Date);
    // Before the first class: paid minus the $25 cancellation fee.
    expect(
      mtRefundCents(13200, first, new Date('2026-09-08T12:00:00.000Z'))
    ).toBe(10700);
    // On or after it: non-refundable.
    expect(
      mtRefundCents(13200, first, new Date('2026-09-10T15:00:00.000Z'))
    ).toBe(0);
  });
});
