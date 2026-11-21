import { describe, it, expect } from 'vitest';
import type { Class } from './class';
import type { Instructor } from './instructor';
import type { Registration } from './registration';
import {
  buildClassInstructorStatementDraft,
  buildOnDemandStatementDraft,
  classRefundEntryId,
  classSessionEntryId,
  isPayoutDay,
  isPayoutMonth,
  isInStatementWindow,
  monthKeyInStudioZone,
  paidTotalForYear,
  paidTotalsByYear,
  statementCoverage,
  prorateAcrossSessions,
  registrationEarnsInstructorShare,
  sessionShareCents,
  statementStaleReasons,
  type BuildClassInstructorStatementInput,
  type ClassInstructorStatement,
  type PayoutLedgerEntry,
} from './class-instructor-payout';

const created = new Date('2026-09-01T12:00:00Z');

function instructor(overrides: Partial<Instructor> = {}): Instructor {
  return {
    id: 'inst-1',
    name: 'Test Instructor',
    email: 'instructor@example.com',
    status: 'active',
    payRateType: 'percentage',
    payRate: 0.8,
    createdAt: created,
    updatedAt: created,
    ...overrides,
  };
}

function klass(overrides: Partial<Omit<Class, 'sessions'>> & { sessions?: string[] } = {}): Class {
  const { sessions, ...rest } = overrides;
  return {
    id: 'class-1',
    name: 'Stained Glass Basics',
    description: 'A class.',
    instructorId: 'inst-1',
    sessions: (sessions ?? ['2026-10-07T22:00:00Z']).map((s) => ({ dateTime: new Date(s) })),
    durationMinutes: 120,
    capacity: 8,
    priceCents: 5000,
    skillLevel: 'all-levels',
    status: 'published',
    createdAt: created,
    updatedAt: created,
    ...rest,
  } as Class;
}

function reg(overrides: Partial<Registration> = {}): Registration {
  return {
    id: 'reg-1',
    classId: 'class-1',
    customerEmail: 'student@example.com',
    customerName: 'Test Student',
    quantity: 1,
    pricePaidCents: 5300,
    subtotalCents: 5000,
    taxAmountCents: 300,
    taxRatePercent: 6,
    status: 'confirmed',
    source: 'web',
    createdAt: created,
    updatedAt: created,
    ...overrides,
  };
}

function entry(overrides: Partial<PayoutLedgerEntry>): PayoutLedgerEntry {
  return {
    id: 'x',
    kind: 'class-session',
    payeeType: 'instructor',
    payeeId: 'inst-1',
    statementId: 'stmt-sep',
    classId: 'class-1',
    registrationId: 'reg-1',
    revenueCents: 0,
    shareCents: 0,
    createdAt: created,
    ...overrides,
  };
}

function build(overrides: Partial<BuildClassInstructorStatementInput> = {}) {
  const classes = overrides.classes ?? [klass()];
  return buildClassInstructorStatementDraft({
    instructor: instructor(),
    month: '2026-10',
    classes,
    registrationsByClass: { 'class-1': [reg()] },
    existingEntries: [],
    paidStatementIds: new Set(),
    now: new Date('2026-11-02T12:00:00Z'),
    ...overrides,
  });
}

describe('registrationEarnsInstructorShare', () => {
  it('counts confirmed and no-show — M&S kept the money', () => {
    expect(registrationEarnsInstructorShare(reg({ status: 'confirmed' }))).toBe(true);
    expect(registrationEarnsInstructorShare(reg({ status: 'no-show' }))).toBe(true);
  });

  it('counts a cancellation only when nothing was refunded', () => {
    expect(registrationEarnsInstructorShare(reg({ status: 'cancelled' }))).toBe(true);
    expect(
      registrationEarnsInstructorShare(reg({ status: 'cancelled', refundedAt: created }))
    ).toBe(false);
  });

  it('excludes pending and refunded', () => {
    expect(registrationEarnsInstructorShare(reg({ status: 'pending' }))).toBe(false);
    expect(registrationEarnsInstructorShare(reg({ status: 'refunded' }))).toBe(false);
  });
});

describe('prorateAcrossSessions', () => {
  it('splits evenly and gives the remainder to the last session', () => {
    expect(prorateAcrossSessions(10000, 3)).toEqual([3333, 3333, 3334]);
  });

  it('always sums to the total', () => {
    for (const [total, n] of [[1, 4], [4999, 7], [12345, 6], [0, 3]]) {
      const parts = prorateAcrossSessions(total, n);
      expect(parts).toHaveLength(n);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it('returns nothing for a class with no sessions', () => {
    expect(prorateAcrossSessions(5000, 0)).toEqual([]);
  });
});

describe('sessionShareCents', () => {
  it('sums across every session to exactly round(total × rate)', () => {
    for (const [total, n] of [[4999, 3], [10001, 7], [3333, 2], [1, 3]]) {
      const shares = Array.from({ length: n }, (_, i) => sessionShareCents(total, 0.8, n, i));
      expect(shares.reduce((a, b) => a + b, 0)).toBe(Math.round(total * 0.8));
    }
  });

  it('is 80% of a single-session class', () => {
    expect(sessionShareCents(5000, 0.8, 1, 0)).toBe(4000);
  });
});

describe('month helpers', () => {
  it('reads the month in studio time, not UTC', () => {
    // 11:30 PM Oct 31 Eastern is already Nov 1 in UTC.
    expect(monthKeyInStudioZone(new Date('2026-11-01T03:30:00Z'))).toBe('2026-10');
    expect(monthKeyInStudioZone(new Date('2026-11-01T05:00:00Z'))).toBe('2026-11');
  });

  it('validates YYYY-MM', () => {
    expect(isPayoutMonth('2026-10')).toBe(true);
    expect(isPayoutMonth('2026-13')).toBe(false);
    expect(isPayoutMonth('2026-1')).toBe(false);
    expect(isPayoutMonth(202610)).toBe(false);
  });

  it('puts the month itself and stragglers back to the start month in the window', () => {
    expect(isInStatementWindow('2026-10', '2026-10', '2026-09')).toBe(true);
    expect(isInStatementWindow('2026-09', '2026-10', '2026-09')).toBe(true);
    expect(isInStatementWindow('2026-08', '2026-10', '2026-09')).toBe(false);
    expect(isInStatementWindow('2026-11', '2026-10', '2026-09')).toBe(false);
    expect(isInStatementWindow('2025-10', '2025-10', '2026-09')).toBe(true);
  });

  it('accepts only real calendar days written YYYY-MM-DD', () => {
    expect(isPayoutDay('2026-11-08')).toBe(true);
    expect(isPayoutDay('2028-02-29')).toBe(true);
    expect(isPayoutDay('2026-02-30')).toBe(false);
    expect(isPayoutDay('2026-13-01')).toBe(false);
    expect(isPayoutDay('2026-11')).toBe(false);
    expect(isPayoutDay('11/08/2026')).toBe(false);
    expect(isPayoutDay(20261108)).toBe(false);
    expect(isPayoutDay(undefined)).toBe(false);
  });
});

describe('buildClassInstructorStatementDraft', () => {
  it('pays 80% of the pre-tax, post-discount subtotal for a one-session class', () => {
    const draft = build({
      registrationsByClass: {
        'class-1': [
          reg({ id: 'reg-a', subtotalCents: 4000, pricePaidCents: 4240, discountAmountCents: 1000 }),
          reg({ id: 'reg-b', quantity: 2, subtotalCents: 10000, pricePaidCents: 10600 }),
        ],
      },
    });

    expect(draft.missingRateConfig).toBe(false);
    expect(draft.payRate).toBe(0.8);
    expect(draft.classes).toHaveLength(1);
    expect(draft.classes[0]).toMatchObject({
      classId: 'class-1',
      className: 'Stained Glass Basics',
      totalSessions: 1,
      headcount: 3,
      grossCents: 14000,
      shareCents: 11200,
      includesEarlierMonths: false,
    });
    expect(draft.classes[0].registrationIds.sort()).toEqual(['reg-a', 'reg-b']);
    expect(draft.totalOwedCents).toBe(11200);
    expect(draft.entries.map((e) => e.id).sort()).toEqual([
      classSessionEntryId('reg-a', 0),
      classSessionEntryId('reg-b', 0),
    ]);
  });

  it('counts no-shows and unrefunded cancellations, not pending or refunded', () => {
    const draft = build({
      registrationsByClass: {
        'class-1': [
          reg({ id: 'r-confirmed' }),
          reg({ id: 'r-noshow', status: 'no-show' }),
          reg({ id: 'r-cancel-kept', status: 'cancelled' }),
          reg({ id: 'r-cancel-refunded', status: 'cancelled', refundedAt: created }),
          reg({ id: 'r-pending', status: 'pending' }),
          reg({ id: 'r-refunded', status: 'refunded' }),
        ],
      },
    });
    expect(draft.classes[0].registrationIds.sort()).toEqual([
      'r-cancel-kept',
      'r-confirmed',
      'r-noshow',
    ]);
    expect(draft.shareCents).toBe(3 * 4000);
  });

  it('splits a class across the months its sessions fall in', () => {
    const twoMonth = klass({ sessions: ['2026-10-28T22:00:00Z', '2026-11-04T23:00:00Z'] });
    const registrationsByClass = { 'class-1': [reg({ subtotalCents: 9999 })] };

    const october = build({ classes: [twoMonth], registrationsByClass, now: new Date('2026-12-01T12:00:00Z') });
    expect(october.classes[0].sessions.map((s) => s.index)).toEqual([0]);
    expect(october.grossCents).toBe(4999);
    expect(october.shareCents).toBe(Math.round(9999 * 0.8 * 0.5));

    // November, with October's session already claimed.
    const november = build({
      classes: [twoMonth],
      month: '2026-11',
      registrationsByClass,
      existingEntries: october.entries.map((e) => entry({ ...e })),
      now: new Date('2026-12-01T12:00:00Z'),
    });
    expect(november.classes[0].sessions.map((s) => s.index)).toEqual([1]);
    expect(november.grossCents).toBe(5000);
    expect(october.shareCents + november.shareCents).toBe(Math.round(9999 * 0.8));
    expect(october.grossCents + november.grossCents).toBe(9999);
  });

  it('puts an 11:30 PM Oct 31 session on October', () => {
    const late = klass({ sessions: ['2026-11-01T03:30:00Z'], durationMinutes: 20 });
    expect(build({ classes: [late] }).classes).toHaveLength(1);
    expect(build({ classes: [late], month: '2026-09' }).classes).toHaveLength(0);
  });

  it('skips sessions that have not ended yet', () => {
    const draft = build({ now: new Date('2026-10-07T23:00:00Z') }); // mid-class
    expect(draft.classes).toHaveLength(0);
    expect(draft.entries).toHaveLength(0);
  });

  it('never claims an entry that already exists', () => {
    const draft = build({
      existingEntries: [entry({ id: classSessionEntryId('reg-1', 0) })],
    });
    expect(draft.classes).toHaveLength(0);
    expect(draft.totalOwedCents).toBe(0);
  });

  it('sweeps in unclaimed sessions from earlier months, flagged', () => {
    const september = klass({ sessions: ['2026-09-20T18:00:00Z'] });
    const draft = build({ classes: [september] });
    expect(draft.classes[0].includesEarlierMonths).toBe(true);
    expect(draft.shareCents).toBe(4000);
  });

  it('never sweeps in stragglers from before the start month', () => {
    const august = klass({ sessions: ['2026-08-20T18:00:00Z'] });
    expect(build({ classes: [august] }).classes).toHaveLength(0);
    expect(build({ classes: [august], startMonth: '2026-08' }).classes).toHaveLength(1);
  });

  it('still pays a month before the start month when asked for it directly', () => {
    const august = klass({ sessions: ['2026-08-20T18:00:00Z'] });
    expect(build({ classes: [august], month: '2026-08' }).classes).toHaveLength(1);
  });

  it('ignores cancelled classes and classes taught by someone else', () => {
    const draft = build({
      classes: [
        klass({ id: 'class-1', status: 'cancelled' }),
        klass({ id: 'class-2', instructorId: 'inst-2' }),
        klass({ id: 'class-3', sessions: [] }),
      ],
      registrationsByClass: {
        'class-1': [reg({ classId: 'class-1' })],
        'class-2': [reg({ id: 'reg-2', classId: 'class-2' })],
        'class-3': [reg({ id: 'reg-3', classId: 'class-3' })],
      },
    });
    expect(draft.classes).toHaveLength(0);
  });

  it('flags a missing percentage rate and owes nothing', () => {
    for (const bad of [
      instructor({ payRateType: 'flat', payRate: 5000 }),
      instructor({ payRate: undefined }),
      instructor({ payRateType: undefined }),
    ]) {
      const draft = build({ instructor: bad });
      expect(draft.missingRateConfig).toBe(true);
      expect(draft.payRate).toBeUndefined();
      expect(draft.grossCents).toBe(5000);
      expect(draft.shareCents).toBe(0);
    }
  });

  describe('refund adjustments', () => {
    const paidEntry = entry({
      id: classSessionEntryId('reg-1', 0),
      statementId: 'stmt-oct',
      shareCents: 4000,
    });

    it('takes back what was paid when a registration is refunded after payout', () => {
      const refundedAt = new Date('2026-11-10T15:00:00Z');
      const draft = build({
        month: '2026-11',
        registrationsByClass: { 'class-1': [reg({ status: 'refunded', refundedAt })] },
        existingEntries: [paidEntry],
        paidStatementIds: new Set(['stmt-oct']),
        now: new Date('2026-12-01T12:00:00Z'),
      });
      expect(draft.classes).toHaveLength(0);
      expect(draft.adjustments).toEqual([
        {
          kind: 'refund',
          registrationId: 'reg-1',
          classId: 'class-1',
          className: 'Stained Glass Basics',
          refundedAt,
          shareCents: -4000,
        },
      ]);
      expect(draft.adjustmentsCents).toBe(-4000);
      expect(draft.totalOwedCents).toBe(-4000);
      expect(draft.entries).toEqual([
        expect.objectContaining({ id: classRefundEntryId('reg-1'), kind: 'class-refund', shareCents: -4000 }),
      ]);
    });

    it('treats a cancellation with a refund the same way', () => {
      const draft = build({
        month: '2026-11',
        registrationsByClass: { 'class-1': [reg({ status: 'cancelled', refundedAt: created })] },
        existingEntries: [paidEntry],
        paidStatementIds: new Set(['stmt-oct']),
      });
      expect(draft.adjustmentsCents).toBe(-4000);
    });

    it('does nothing while the statement it was on is still pending (void and regenerate instead)', () => {
      const draft = build({
        month: '2026-11',
        registrationsByClass: { 'class-1': [reg({ status: 'refunded' })] },
        existingEntries: [paidEntry],
        paidStatementIds: new Set(),
      });
      expect(draft.adjustments).toEqual([]);
    });

    it('does nothing for a refund that was never paid out, or already adjusted', () => {
      expect(
        build({ registrationsByClass: { 'class-1': [reg({ status: 'refunded' })] } }).adjustments
      ).toEqual([]);
      expect(
        build({
          registrationsByClass: { 'class-1': [reg({ status: 'refunded' })] },
          existingEntries: [paidEntry, entry({ id: classRefundEntryId('reg-1'), kind: 'class-refund' })],
          paidStatementIds: new Set(['stmt-oct']),
        }).adjustments
      ).toEqual([]);
    });

    it('does nothing for a pending registration', () => {
      const draft = build({
        registrationsByClass: { 'class-1': [reg({ status: 'pending' })] },
        existingEntries: [paidEntry],
        paidStatementIds: new Set(['stmt-oct']),
      });
      expect(draft.adjustments).toEqual([]);
    });

    it('still adjusts when the class itself was cancelled', () => {
      const draft = build({
        classes: [klass({ status: 'cancelled' })],
        month: '2026-11',
        registrationsByClass: { 'class-1': [reg({ status: 'refunded' })] },
        existingEntries: [paidEntry],
        paidStatementIds: new Set(['stmt-oct']),
      });
      expect(draft.adjustmentsCents).toBe(-4000);
    });

    it('nets against the month\'s earnings', () => {
      const draft = build({
        classes: [klass(), klass({ id: 'class-2', name: 'Weaving', sessions: ['2026-11-10T18:00:00Z'] })],
        month: '2026-11',
        registrationsByClass: {
          'class-1': [reg({ status: 'refunded' })],
          'class-2': [reg({ id: 'reg-2', classId: 'class-2', subtotalCents: 10000 })],
        },
        existingEntries: [paidEntry],
        paidStatementIds: new Set(['stmt-oct']),
        now: new Date('2026-12-01T12:00:00Z'),
      });
      expect(draft.shareCents).toBe(8000);
      expect(draft.adjustmentsCents).toBe(-4000);
      expect(draft.totalOwedCents).toBe(4000);
    });
  });

  it('orders classes by name', () => {
    const draft = build({
      classes: [klass({ id: 'b', name: 'Weaving' }), klass({ id: 'a', name: 'Basketry' })],
      registrationsByClass: {
        a: [reg({ id: 'ra', classId: 'a' })],
        b: [reg({ id: 'rb', classId: 'b' })],
      },
    });
    expect(draft.classes.map((c) => c.className)).toEqual(['Basketry', 'Weaving']);
  });
});

describe('throughDate', () => {
  const twoClasses = [
    klass({ id: 'class-1', sessions: ['2026-10-07T22:00:00Z'] }),
    klass({ id: 'class-2', name: 'Weaving', sessions: ['2026-10-21T22:00:00Z'] }),
  ];
  const registrationsByClass = {
    'class-1': [reg({ id: 'reg-1', classId: 'class-1' })],
    'class-2': [reg({ id: 'reg-2', classId: 'class-2' })],
  };

  it('leaves sessions held after that day for a later statement', () => {
    const draft = build({ classes: twoClasses, registrationsByClass, throughDate: '2026-10-07' });
    expect(draft.entries.map((e) => e.id)).toEqual(['class-session_reg-1_0']);
    expect(draft.totalOwedCents).toBe(4000);
    expect(build({ classes: twoClasses, registrationsByClass, throughDate: '2026-10-06' }).entries).toEqual([]);
    expect(build({ classes: twoClasses, registrationsByClass, throughDate: '2026-10-21' }).entries).toHaveLength(2);
  });

  it('reads the session day in studio time', () => {
    // 11:30 PM Oct 7 Eastern is Oct 8 in UTC; it still counts as Oct 7.
    const late = [klass({ sessions: ['2026-10-08T03:30:00Z'] })];
    expect(build({ classes: late, throughDate: '2026-10-07' }).entries).toHaveLength(1);
  });

  it('can only narrow: a session that has not ended is never included', () => {
    const draft = build({
      classes: twoClasses,
      registrationsByClass,
      throughDate: '2026-12-31',
      now: new Date('2026-10-21T22:30:00Z'), // half an hour into the second class
    });
    expect(draft.entries.map((e) => e.id)).toEqual(['class-session_reg-1_0']);
  });

  it('splits a two-session class at the cutoff', () => {
    const series = [klass({ sessions: ['2026-10-07T22:00:00Z', '2026-10-14T22:00:00Z'] })];
    const first = build({ classes: series, throughDate: '2026-10-10' });
    expect(first.entries.map((e) => e.id)).toEqual(['class-session_reg-1_0']);
    expect(first.shareCents).toBe(2000);
  });
});

describe('buildOnDemandStatementDraft', () => {
  const onDemand = (overrides: Partial<Omit<BuildClassInstructorStatementInput, 'month'>> = {}) =>
    buildOnDemandStatementDraft({
      instructor: instructor(),
      classes: [klass()],
      registrationsByClass: { 'class-1': [reg()] },
      existingEntries: [],
      paidStatementIds: new Set(),
      now: new Date('2026-11-21T17:00:00Z'),
      ...overrides,
    });

  it('claims a class as soon as it has ended, in the month it is still running', () => {
    const draft = onDemand({
      classes: [klass({ sessions: ['2026-11-21T14:00:00Z'] })], // ended an hour ago
    });
    expect(draft.month).toBe('2026-11');
    expect(draft.entries.map((e) => e.id)).toEqual(['class-session_reg-1_0']);
    expect(draft.totalOwedCents).toBe(4000);
  });

  it('never claims a class that is still running or has not started', () => {
    const draft = onDemand({
      classes: [
        klass({ id: 'class-1', sessions: ['2026-11-21T16:00:00Z'] }), // started an hour ago, 2 hours long
        klass({ id: 'class-2', sessions: ['2026-11-28T16:00:00Z'] }),
        klass({ id: 'class-3', sessions: ['2026-12-05T16:00:00Z'] }),
      ],
      registrationsByClass: {
        'class-1': [reg({ id: 'reg-1', classId: 'class-1' })],
        'class-2': [reg({ id: 'reg-2', classId: 'class-2' })],
        'class-3': [reg({ id: 'reg-3', classId: 'class-3' })],
      },
    });
    expect(draft.entries).toEqual([]);
    expect(draft.totalOwedCents).toBe(0);
  });

  it('labels the statement with the month of the latest session it covers', () => {
    // Generated in November for an October class: October, with nothing "earlier".
    const october = onDemand();
    expect(october.month).toBe('2026-10');
    expect(october.classes[0].includesEarlierMonths).toBe(false);

    // September and October together: October, and September is flagged as earlier.
    const both = onDemand({
      classes: [
        klass({ id: 'class-1', sessions: ['2026-09-16T22:00:00Z'] }),
        klass({ id: 'class-2', name: 'Weaving', sessions: ['2026-10-21T22:00:00Z'] }),
      ],
      registrationsByClass: {
        'class-1': [reg({ id: 'reg-1', classId: 'class-1' })],
        'class-2': [reg({ id: 'reg-2', classId: 'class-2' })],
      },
    });
    expect(both.month).toBe('2026-10');
    expect(both.classes.map((c) => c.includesEarlierMonths)).toEqual([true, false]);
  });

  it('labels a draft holding only adjustments with the current month', () => {
    const draft = onDemand({
      registrationsByClass: { 'class-1': [reg({ status: 'refunded', refundedAt: new Date('2026-11-10T15:00:00Z') })] },
      existingEntries: [
        entry({ id: classSessionEntryId('reg-1', 0), statementId: 'stmt-paid', shareCents: 4000 }),
      ],
      paidStatementIds: new Set(['stmt-paid']),
    });
    expect(draft.month).toBe('2026-11');
    expect(draft.classes).toEqual([]);
    expect(draft.totalOwedCents).toBe(-4000);
  });

  it('does not reach back before the payout start month', () => {
    expect(onDemand({ classes: [klass({ sessions: ['2026-08-12T22:00:00Z'] })] }).entries).toEqual([]);
  });

  /**
   * #344: an instructor on 75% teaches two one-session classes in one month,
   * each with eight paid seats at $65 and one refunded seat, and is paid
   * after each class rather than once the month has ended.
   */
  describe('paid per class, twice in one month', () => {
    const fern = instructor({ id: 'inst-fern', name: 'Fern Alder', payRate: 0.75 });
    const wreaths = klass({ id: 'class-wreath', name: 'Evergreen Wreaths', instructorId: 'inst-fern', sessions: ['2026-11-08T19:00:00Z'] });
    const ornaments = klass({ id: 'class-ornament', name: 'Felted Ornaments', instructorId: 'inst-fern', sessions: ['2026-11-21T19:00:00Z'] });
    const seats = (classId: string): Registration[] => [
      ...Array.from({ length: 8 }, (_, i) =>
        reg({ id: `${classId}-reg-${i + 1}`, classId, subtotalCents: 6500, pricePaidCents: 6890 })
      ),
      reg({
        id: `${classId}-reg-refunded`,
        classId,
        subtotalCents: 6500,
        pricePaidCents: 6890,
        status: 'refunded',
        refundedAt: new Date('2026-11-05T15:00:00Z'),
      }),
    ];
    const registrationsByClass = { 'class-wreath': seats('class-wreath'), 'class-ornament': seats('class-ornament') };
    const draftAt = (now: string, existingEntries: PayoutLedgerEntry[] = [], paid: string[] = []) =>
      buildOnDemandStatementDraft({
        instructor: fern,
        classes: [wreaths, ornaments],
        registrationsByClass,
        existingEntries,
        paidStatementIds: new Set(paid),
        now: new Date(now),
      });
    const claim = (draft: ReturnType<typeof draftAt>, statementId: string): PayoutLedgerEntry[] =>
      draft.entries.map((e) => ({ ...e, statementId, createdAt: created }));

    it('owes $390 after the first class, and nothing once that is on a statement', () => {
      const first = draftAt('2026-11-11T15:00:00Z');
      expect(first.classes.map((c) => c.className)).toEqual(['Evergreen Wreaths']);
      expect(first.classes[0].headcount).toBe(8);
      expect(first.grossCents).toBe(52000);
      expect(first.totalOwedCents).toBe(39000);
      expect(first.entries).toHaveLength(8);

      const after = draftAt('2026-11-11T16:00:00Z', claim(first, 'stmt-1'), ['stmt-1']);
      expect(after.entries).toEqual([]);
      expect(after.totalOwedCents).toBe(0);
    });

    it('owes only the second class after it is held, never the first again', () => {
      const first = draftAt('2026-11-11T15:00:00Z');
      const paidEntries = claim(first, 'stmt-1');

      const second = draftAt('2026-11-22T15:00:00Z', paidEntries, ['stmt-1']);
      expect(second.classes.map((c) => c.className)).toEqual(['Felted Ornaments']);
      expect(second.totalOwedCents).toBe(39000);
      const firstIds = new Set(first.entries.map((e) => e.id));
      expect(second.entries.some((e) => firstIds.has(e.id))).toBe(false);

      const settled = draftAt('2026-11-23T15:00:00Z', [...paidEntries, ...claim(second, 'stmt-2')], ['stmt-1', 'stmt-2']);
      expect(settled.entries).toEqual([]);
      expect(settled.totalOwedCents).toBe(0);
    });

    it('can record the first payment late, with both classes already finished', () => {
      const late = buildOnDemandStatementDraft({
        instructor: fern,
        classes: [wreaths, ornaments],
        registrationsByClass,
        existingEntries: [],
        paidStatementIds: new Set(),
        now: new Date('2026-12-02T15:00:00Z'),
        throughDate: '2026-11-08',
      });
      expect(late.classes.map((c) => c.className)).toEqual(['Evergreen Wreaths']);
      expect(late.totalOwedCents).toBe(39000);
    });

    it('takes a refund after the first payment off the next statement', () => {
      const first = draftAt('2026-11-11T15:00:00Z');
      const paidEntries = claim(first, 'stmt-1');
      const withRefund = {
        ...registrationsByClass,
        'class-wreath': registrationsByClass['class-wreath'].map((r) =>
          r.id === 'class-wreath-reg-1'
            ? { ...r, status: 'refunded' as const, refundedAt: new Date('2026-11-15T15:00:00Z') }
            : r
        ),
      };
      const second = buildOnDemandStatementDraft({
        instructor: fern,
        classes: [wreaths, ornaments],
        registrationsByClass: withRefund,
        existingEntries: paidEntries,
        paidStatementIds: new Set(['stmt-1']),
        now: new Date('2026-11-22T15:00:00Z'),
      });
      // $65 × 75% = $48.75, rounded as it was when it was paid.
      expect(second.adjustments).toEqual([
        expect.objectContaining({ registrationId: 'class-wreath-reg-1', shareCents: -4875 }),
      ]);
      expect(second.totalOwedCents).toBe(39000 - 4875);
    });
  });
});

describe('statementCoverage', () => {
  const line = (sessions: string[]) => ({
    classId: 'c',
    className: 'A class',
    totalSessions: sessions.length,
    sessions: sessions.map((at, index) => ({ index, at: new Date(at) })),
    includesEarlierMonths: false,
    headcount: 1,
    registrationIds: ['reg-1'],
    grossCents: 0,
    shareCents: 0,
  });

  it('gives the first and last studio day across every class', () => {
    expect(
      statementCoverage({
        classes: [line(['2026-11-21T19:00:00Z']), line(['2026-11-08T19:00:00Z', '2026-11-15T19:00:00Z'])],
      })
    ).toEqual({ from: '2026-11-08', to: '2026-11-21' });
  });

  it('reads the day in studio time', () => {
    // 11:30 PM Oct 31 Eastern.
    expect(statementCoverage({ classes: [line(['2026-11-01T03:30:00Z'])] })).toEqual({
      from: '2026-10-31',
      to: '2026-10-31',
    });
  });

  it('is undefined for a statement with no sessions', () => {
    expect(statementCoverage({ classes: [] })).toBeUndefined();
  });
});

describe('buildClassInstructorStatementDraft: private group hours', () => {
  // Three one-hour slots on Saturday Oct 10 (10, 11 AM and noon Eastern).
  const hours = ['2026-10-10T14:00:00Z', '2026-10-10T15:00:00Z', '2026-10-10T16:00:00Z'];
  const privateClass = (overrides: Parameters<typeof klass>[0] = {}) =>
    klass({
      id: 'class-ph',
      name: 'Private Glass Party',
      format: 'privateHours',
      sessions: hours,
      durationMinutes: 60,
      capacity: 10,
      priceCents: 30000,
      ...overrides,
    });
  const group = (id: string, hourIndex: number, overrides: Partial<Registration> = {}) =>
    reg({
      id,
      classId: 'class-ph',
      customerName: 'Robin Ashfield',
      customerEmail: 'robin@example.com',
      slotStart: new Date(hours[hourIndex]),
      groupSize: 6,
      subtotalCents: 30000,
      pricePaidCents: 31800,
      ...overrides,
    });

  it('pays a group\'s whole subtotal on the hour it booked, once that hour has ended', () => {
    const draft = build({
      classes: [privateClass()],
      registrationsByClass: { 'class-ph': [group('reg-a', 0), group('reg-b', 1)] },
      now: new Date('2026-10-10T15:30:00Z'), // hour 0 over, hour 1 in progress
    });
    expect(draft.classes).toHaveLength(1);
    expect(draft.classes[0]).toMatchObject({
      classId: 'class-ph',
      totalSessions: 3,
      registrationIds: ['reg-a'],
      grossCents: 30000,
      shareCents: 24000,
    });
    expect(draft.classes[0].sessions.map((s) => s.index)).toEqual([0]);
    expect(draft.entries).toEqual([
      expect.objectContaining({
        id: classSessionEntryId('reg-a', 0),
        registrationId: 'reg-a',
        sessionIndex: 0,
        revenueCents: 30000,
        shareCents: 24000,
      }),
    ]);
  });

  it('rounds the share of the whole subtotal', () => {
    const draft = build({
      classes: [privateClass()],
      registrationsByClass: { 'class-ph': [group('reg-a', 1, { subtotalCents: 12345 })] },
    });
    expect(draft.shareCents).toBe(Math.round(12345 * 0.8));
    expect(draft.grossCents).toBe(12345);
  });

  it('ids the entry by registration alone, recording the real hour index', () => {
    const fresh = build({
      classes: [privateClass()],
      registrationsByClass: { 'class-ph': [group('reg-c', 2)] },
    });
    expect(fresh.entries).toHaveLength(1);
    expect(fresh.entries[0]).toMatchObject({
      id: classSessionEntryId('reg-c', 0),
      sessionIndex: 2,
      revenueCents: 30000,
    });
    expect(fresh.classes[0].sessions.map((s) => s.index)).toEqual([2]);

    const again = build({
      classes: [privateClass()],
      registrationsByClass: { 'class-ph': [group('reg-c', 2)] },
      existingEntries: [entry({ id: 'class-session_reg-c_0', classId: 'class-ph', registrationId: 'reg-c' })],
    });
    expect(again.classes).toHaveLength(0);
    expect(again.entries).toHaveLength(0);
    expect(again.totalOwedCents).toBe(0);
  });

  it('counts the group size as headcount, falling back to quantity', () => {
    const draft = build({
      classes: [privateClass()],
      registrationsByClass: {
        'class-ph': [
          group('reg-a', 0, { groupSize: 6 }),
          group('reg-b', 1, { groupSize: 4 }),
          group('reg-c', 2, { groupSize: undefined, quantity: 1 }),
        ],
      },
    });
    expect(draft.classes[0].headcount).toBe(6 + 4 + 1);
    expect(draft.grossCents).toBe(90000);
  });

  it('skips a booking whose hour is not on the class', () => {
    const draft = build({
      classes: [privateClass()],
      registrationsByClass: {
        'class-ph': [group('reg-x', 0, { slotStart: new Date('2026-10-10T18:00:00Z') })],
      },
    });
    expect(draft.classes).toHaveLength(0);
    expect(draft.entries).toHaveLength(0);
  });

  it('flags a missing rate and owes nothing, still reporting revenue', () => {
    const draft = build({
      instructor: instructor({ payRate: undefined }),
      classes: [privateClass()],
      registrationsByClass: { 'class-ph': [group('reg-a', 0)] },
    });
    expect(draft.missingRateConfig).toBe(true);
    expect(draft.payRate).toBeUndefined();
    expect(draft.grossCents).toBe(30000);
    expect(draft.shareCents).toBe(0);
    expect(draft.entries[0]).toMatchObject({ revenueCents: 30000, shareCents: 0 });
  });

  it('still prorates a seat class on the same statement', () => {
    const seats = klass({ sessions: ['2026-10-07T22:00:00Z', '2026-10-14T22:00:00Z'] });
    const draft = build({
      classes: [privateClass(), seats],
      registrationsByClass: {
        'class-ph': [group('reg-a', 0)],
        'class-1': [reg({ subtotalCents: 9999 })],
      },
    });
    const seatLine = draft.classes.find((c) => c.classId === 'class-1');
    const privateLine = draft.classes.find((c) => c.classId === 'class-ph');
    expect(seatLine).toMatchObject({ grossCents: 9999, headcount: 1, totalSessions: 2 });
    expect(seatLine?.sessions.map((s) => s.index)).toEqual([0, 1]);
    expect(
      draft.entries.filter((e) => e.classId === 'class-1').map((e) => [e.id, e.revenueCents])
    ).toEqual([
      [classSessionEntryId('reg-1', 0), 4999],
      [classSessionEntryId('reg-1', 1), 5000],
    ]);
    expect(seatLine?.shareCents).toBe(Math.round(9999 * 0.8));
    expect(privateLine).toMatchObject({ grossCents: 30000, shareCents: 24000 });
    expect(draft.totalOwedCents).toBe(Math.round(9999 * 0.8) + 24000);
  });
});

describe('statementStaleReasons', () => {
  const statement: Pick<ClassInstructorStatement, 'status' | 'classes'> = {
    status: 'pending',
    classes: [
      {
        classId: 'class-1',
        className: 'Stained Glass Basics',
        totalSessions: 1,
        sessions: [{ index: 0, at: new Date('2026-10-07T22:00:00Z') }],
        includesEarlierMonths: false,
        headcount: 1,
        registrationIds: ['reg-1'],
        grossCents: 5000,
        shareCents: 4000,
      },
    ],
  };

  it('is fresh when nothing changed', () => {
    expect(statementStaleReasons(statement, [klass()], [reg()])).toEqual([]);
  });

  it('flags a registration refunded since the statement was generated', () => {
    expect(statementStaleReasons(statement, [klass()], [reg({ status: 'refunded' })])).toEqual([
      { kind: 'registration-no-longer-earns', classId: 'class-1', registrationId: 'reg-1', status: 'refunded' },
    ]);
  });

  it('flags a class whose sessions were edited', () => {
    const edited = klass({ sessions: ['2026-10-07T22:00:00Z', '2026-10-14T22:00:00Z'] });
    expect(statementStaleReasons(statement, [edited], [reg()])).toEqual([
      { kind: 'sessions-changed', classId: 'class-1', was: 1, now: 2 },
    ]);
  });

  it('never flags a paid or void statement', () => {
    for (const status of ['paid', 'void'] as const) {
      expect(
        statementStaleReasons({ ...statement, status }, [klass()], [reg({ status: 'refunded' })])
      ).toEqual([]);
    }
  });

  it('ignores records it was not given', () => {
    expect(statementStaleReasons(statement, [], [])).toEqual([]);
  });
});

describe('paidTotalForYear', () => {
  const base = {
    instructorName: 'Test Instructor',
    payRate: 0.8,
    classes: [],
    adjustments: [],
    grossCents: 0,
    shareCents: 0,
    adjustmentsCents: 0,
    entryIds: [],
    createdAt: created,
    updatedAt: created,
  };
  const statements: ClassInstructorStatement[] = [
    { ...base, id: 's1', instructorId: 'inst-1', month: '2026-11', status: 'paid', paidOn: '2026-12-05', totalOwedCents: 1000 },
    { ...base, id: 's2', instructorId: 'inst-1', month: '2026-12', status: 'paid', paidOn: '2027-01-04', totalOwedCents: 2000 },
    { ...base, id: 's3', instructorId: 'inst-1', month: '2026-10', status: 'paid', paidOn: '2026-11-03', totalOwedCents: 400 },
    { ...base, id: 's4', instructorId: 'inst-1', month: '2026-09', status: 'pending', totalOwedCents: 9999 },
    { ...base, id: 's5', instructorId: 'inst-2', month: '2026-10', status: 'paid', paidOn: '2026-11-03', totalOwedCents: 7777 },
  ];

  it('sums paid statements by the year they were paid in', () => {
    expect(paidTotalForYear(statements, 'inst-1', 2026)).toBe(1400);
    expect(paidTotalForYear(statements, 'inst-1', 2027)).toBe(2000);
    expect(paidTotalForYear(statements, 'inst-2', 2026)).toBe(7777);
  });

  it('breaks what was paid down by the year it was paid in', () => {
    expect(paidTotalsByYear(statements, 'inst-1')).toEqual({ '2026': 1400, '2027': 2000 });
    expect(paidTotalsByYear(statements, 'inst-2')).toEqual({ '2026': 7777 });
    expect(paidTotalsByYear(statements, 'nobody')).toEqual({});
  });

  it('counts two payments in one month as two payments', () => {
    const perClass: ClassInstructorStatement[] = [
      { ...base, id: 'a', instructorId: 'inst-1', month: '2026-11', status: 'paid', paidOn: '2026-11-11', totalOwedCents: 39000 },
      { ...base, id: 'b', instructorId: 'inst-1', month: '2026-11', status: 'paid', paidOn: '2026-11-22', totalOwedCents: 39000 },
      { ...base, id: 'c', instructorId: 'inst-1', month: '2026-11', status: 'void', totalOwedCents: 39000 },
    ];
    expect(paidTotalForYear(perClass, 'inst-1', 2026)).toBe(78000);
    expect(paidTotalsByYear(perClass, 'inst-1')).toEqual({ '2026': 78000 });
  });
});
