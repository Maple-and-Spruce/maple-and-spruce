import { describe, it, expect } from 'vitest';
import type { Class } from './class';
import type { Instructor } from './instructor';
import type { Registration } from './registration';
import {
  buildClassInstructorStatementDraft,
  classRefundEntryId,
  classSessionEntryId,
  isPayoutMonth,
  isInStatementWindow,
  isPayoutMonthOver,
  monthKeyInStudioZone,
  paidTotalForYear,
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

  it('knows when a month is over in studio time', () => {
    expect(isPayoutMonthOver('2026-10', new Date('2026-11-01T03:30:00Z'))).toBe(false);
    expect(isPayoutMonthOver('2026-10', new Date('2026-11-01T05:00:00Z'))).toBe(true);
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
});
