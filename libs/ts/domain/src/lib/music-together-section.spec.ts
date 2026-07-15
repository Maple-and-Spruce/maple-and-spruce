import { describe, it, expect } from 'vitest';
import {
  mtSectionFirstSessionAt,
  mtSpotsRemaining,
  mtSectionHasAvailability,
  mtSectionEnrollmentWindowActive,
  mtSectionEnrollmentOpen,
  mtSectionDerivedStatus,
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

describe('mtSectionEnrollmentWindowActive', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  const base = { enrollmentActive: true } as Pick<
    MusicTogetherSection,
    'enrollmentActive' | 'enrollmentOpensAt' | 'enrollmentClosesAt'
  >;

  it('is false when the live toggle is off', () => {
    expect(
      mtSectionEnrollmentWindowActive({ ...base, enrollmentActive: false }, now)
    ).toBe(false);
  });
  it('is true when active with no schedule', () => {
    expect(mtSectionEnrollmentWindowActive(base, now)).toBe(true);
  });
  it('is false before a scheduled open (auto-opens once reached)', () => {
    const opensLater = { ...base, enrollmentOpensAt: new Date('2026-10-05T00:00:00Z') };
    expect(mtSectionEnrollmentWindowActive(opensLater, now)).toBe(false);
    expect(
      mtSectionEnrollmentWindowActive(opensLater, new Date('2026-10-06T00:00:00Z'))
    ).toBe(true);
  });
  it('is false at/after a scheduled close', () => {
    const closes = { ...base, enrollmentClosesAt: new Date('2026-09-30T00:00:00Z') };
    expect(mtSectionEnrollmentWindowActive(closes, now)).toBe(false);
  });
});

describe('mtSectionEnrollmentOpen', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  const active = {
    enrollmentActive: true,
    capacityFamilies: 8,
  } as Pick<
    MusicTogetherSection,
    'enrollmentActive' | 'enrollmentOpensAt' | 'enrollmentClosesAt' | 'capacityFamilies'
  >;

  it('is true when window active and under capacity', () => {
    expect(mtSectionEnrollmentOpen(active, now, 7)).toBe(true);
  });
  it('is false at capacity', () => {
    expect(mtSectionEnrollmentOpen(active, now, 8)).toBe(false);
  });
  it('ignores capacity when no family count is given (window-only)', () => {
    expect(mtSectionEnrollmentOpen(active, now)).toBe(true);
  });
});

describe('mtSectionHasAvailability', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  const active = {
    enrollmentActive: true,
    capacityFamilies: 8,
  } as Pick<
    MusicTogetherSection,
    'enrollmentActive' | 'enrollmentOpensAt' | 'enrollmentClosesAt' | 'capacityFamilies'
  >;

  it('is true when enrolling and under capacity', () => {
    expect(mtSectionHasAvailability(active, 7, now)).toBe(true);
  });
  it('is false at capacity', () => {
    expect(mtSectionHasAvailability(active, 8, now)).toBe(false);
  });
  it('is false when enrollment is paused even with room', () => {
    expect(
      mtSectionHasAvailability({ ...active, enrollmentActive: false }, 0, now)
    ).toBe(false);
  });
});

describe('mtSectionDerivedStatus', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  const future = { dateTime: new Date('2026-10-08T14:00:00Z') };
  const past = { dateTime: new Date('2026-09-01T14:00:00Z') };
  const base = {
    visible: true,
    enrollmentActive: false,
    capacityFamilies: 8,
    sessions: [future],
  } as Pick<
    MusicTogetherSection,
    | 'visible'
    | 'enrollmentActive'
    | 'enrollmentOpensAt'
    | 'enrollmentClosesAt'
    | 'capacityFamilies'
    | 'sessions'
  >;

  it('is draft when not visible', () => {
    expect(mtSectionDerivedStatus({ ...base, visible: false }, now)).toBe('draft');
  });
  it('is completed when visible and every session is past', () => {
    expect(mtSectionDerivedStatus({ ...base, sessions: [past] }, now)).toBe(
      'completed'
    );
  });
  it('is open when enrolling with seats', () => {
    expect(
      mtSectionDerivedStatus({ ...base, enrollmentActive: true }, now, 3)
    ).toBe('open');
  });
  it('is full when enrolling at capacity', () => {
    expect(
      mtSectionDerivedStatus({ ...base, enrollmentActive: true }, now, 8)
    ).toBe('full');
  });
  it('is upcoming when visible with a future scheduled open', () => {
    expect(
      mtSectionDerivedStatus(
        {
          ...base,
          enrollmentActive: true,
          enrollmentOpensAt: new Date('2026-10-15T00:00:00Z'),
        },
        now
      )
    ).toBe('upcoming');
  });
  it('is closed when visible but enrollment is paused', () => {
    expect(mtSectionDerivedStatus(base, now)).toBe('closed');
  });
});
