import { describe, it, expect } from 'vitest';
import {
  mtSectionFirstSessionAt,
  mtSpotsRemaining,
  mtSectionHasAvailability,
  mtSectionOffersInstallments,
  mtInstallmentPlanTotalCents,
  MT_DEFAULT_CAPACITY_FAMILIES,
  MT_PRICE_FULL_CENTS,
  MT_DEFAULT_INSTALLMENT_CENTS,
  type MusicTogetherSection,
} from './music-together-section';

describe('Music Together prefill defaults', () => {
  it('provides sensible form prefills (configurable per semester)', () => {
    expect(MT_PRICE_FULL_CENTS).toBe(25200);
    expect(MT_DEFAULT_INSTALLMENT_CENTS).toBe(13200);
    expect(MT_DEFAULT_CAPACITY_FAMILIES).toBe(8);
  });
});

describe('installment plan helpers', () => {
  const plan = [
    { amountCents: 13200, dueAt: new Date('2026-09-01T14:00:00Z') },
    { amountCents: 13200, dueAt: new Date('2026-09-29T14:00:00Z') },
  ];

  it('offers installments only when the plan has 2+ items', () => {
    expect(mtSectionOffersInstallments({ installmentPlan: plan })).toBe(true);
    expect(
      mtSectionOffersInstallments({ installmentPlan: [plan[0]] })
    ).toBe(false);
    expect(mtSectionOffersInstallments({ installmentPlan: undefined })).toBe(
      false
    );
  });

  it('sums the plan total', () => {
    expect(mtInstallmentPlanTotalCents(plan)).toBe(26400);
    expect(mtInstallmentPlanTotalCents(undefined)).toBe(0);
  });

  it('supports an arbitrary N-installment plan', () => {
    const three = [
      { amountCents: 10500, dueAt: new Date('2026-09-01T14:00:00Z') },
      { amountCents: 10500, dueAt: new Date('2026-09-22T14:00:00Z') },
      { amountCents: 10500, dueAt: new Date('2026-10-13T14:00:00Z') },
    ];
    expect(mtSectionOffersInstallments({ installmentPlan: three })).toBe(true);
    expect(mtInstallmentPlanTotalCents(three)).toBe(31500);
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
