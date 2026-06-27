import { describe, it, expect } from 'vitest';
import {
  mtSectionFirstSessionAt,
  mtSpotsRemaining,
  mtSectionHasAvailability,
  MT_DEFAULT_CAPACITY_FAMILIES,
  MT_PRICE_FULL_CENTS,
  MT_INSTALLMENT_CENTS,
  type MusicTogetherSection,
} from './music-together-section';

describe('Music Together pricing constants', () => {
  it('matches the published prices ($252 full, $132 per installment)', () => {
    expect(MT_PRICE_FULL_CENTS).toBe(25200);
    expect(MT_INSTALLMENT_CENTS).toBe(13200);
  });
  it('paying in full is cheaper than two installments (a pay-in-full discount)', () => {
    // Two installments total $264; paying in full is $252 — a $12 incentive.
    expect(MT_INSTALLMENT_CENTS * 2).toBeGreaterThan(MT_PRICE_FULL_CENTS);
    expect(MT_INSTALLMENT_CENTS * 2 - MT_PRICE_FULL_CENTS).toBe(1200);
  });
  it('default capacity is 8 families', () => {
    expect(MT_DEFAULT_CAPACITY_FAMILIES).toBe(8);
  });
});

describe('mtSectionFirstSessionAt', () => {
  it('returns the earliest session start regardless of order', () => {
    const earliest = new Date('2026-09-01T14:00:00Z');
    const result = mtSectionFirstSessionAt({
      sessions: [
        { dateTime: new Date('2026-09-15T14:00:00Z') },
        { dateTime: earliest },
        { dateTime: new Date('2026-09-08T14:00:00Z') },
      ],
    });
    expect(result).toEqual(earliest);
  });

  it('returns undefined when there are no sessions', () => {
    expect(mtSectionFirstSessionAt({ sessions: [] })).toBeUndefined();
  });
});

describe('mtSpotsRemaining', () => {
  it('subtracts the family count from capacity', () => {
    expect(mtSpotsRemaining({ capacityFamilies: 8 }, 3)).toBe(5);
  });
  it('never goes negative when over capacity', () => {
    expect(mtSpotsRemaining({ capacityFamilies: 8 }, 9)).toBe(0);
  });
});

describe('mtSectionHasAvailability', () => {
  const open: Pick<MusicTogetherSection, 'capacityFamilies' | 'status'> = {
    capacityFamilies: 8,
    status: 'open',
  };

  it('is true when open and under capacity', () => {
    expect(mtSectionHasAvailability(open, 7)).toBe(true);
  });
  it('is false at capacity', () => {
    expect(mtSectionHasAvailability(open, 8)).toBe(false);
  });
  it('is false when not open even with room', () => {
    expect(mtSectionHasAvailability({ ...open, status: 'draft' }, 0)).toBe(
      false
    );
  });
});
