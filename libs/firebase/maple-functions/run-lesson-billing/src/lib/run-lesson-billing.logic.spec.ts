/**
 * This decides when real money leaves a family's card, so the tests are about
 * the ways it could take money it should not: charging a Hope student, charging
 * twice, charging a family who left, or charging without a card.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MockedFunction } from 'vitest';
import {
  chargeDue,
  planCharges,
  ruleForStudent,
} from './run-lesson-billing.logic';
import type { ChargeDeps, PlanDeps } from './run-lesson-billing.logic';
import type {
  Lesson,
  LessonBillingRule,
  LessonScheduledCharge,
  Student,
} from '@maple/ts/domain';

const NOW = new Date('2026-07-01T12:00:00Z');

const standardRule: LessonBillingRule = {
  id: 'rule-standard',
  name: 'Standard 4-lesson block',
  cadence: 'every-n-lessons',
  lessonsPerCharge: 4,
  anchor: 'before-first',
  anchorOffsetDays: -1,
  isDefault: true,
  createdAt: NOW,
  updatedAt: NOW,
};

function student(overrides: Partial<Student> = {}): Student {
  return {
    id: 'student-1',
    name: 'Rowan',
    instrument: 'violin',
    isAdultStudent: false,
    primaryTeacherId: 'teacher-1',
    isHopeScholarship: false,
    primaryContactName: 'Dana',
    primaryContactEmail: 'dana@example.com',
    status: 'active',
    registeredLessonLength: '30-min-full',
    squareCustomerId: 'cus_1',
    squareCardId: 'card_1',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Student;
}

function lessons(count: number): Lesson[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `lesson-${i + 1}`,
    studentId: 'student-1',
    scheduledAt: new Date(NOW.getTime() + (i + 1) * 7 * 86_400_000),
    durationMinutes: 30,
    teacherId: 'teacher-1',
    status: 'scheduled',
    createdAt: NOW,
    updatedAt: NOW,
  })) as Lesson[];
}

function charge(overrides: Partial<LessonScheduledCharge> = {}): LessonScheduledCharge {
  return {
    id: 'chg-student-1-lesson-1',
    studentId: 'student-1',
    ruleId: 'rule-standard',
    lessonIds: ['lesson-1'],
    amountCents: 16500,
    dueAt: new Date(NOW.getTime() - 86_400_000), // due yesterday
    status: 'scheduled',
    idempotencyKey: 'lesson-chg-student-1-lesson-1',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('ruleForStudent', () => {
  const other: LessonBillingRule = { ...standardRule, id: 'rule-other', isDefault: false };

  it('prefers the student’s own rule', () => {
    expect(
      ruleForStudent({ billingRuleId: 'rule-other' }, [standardRule, other], standardRule)?.id
    ).toBe('rule-other');
  });

  it('falls back to the studio default', () => {
    expect(ruleForStudent({}, [standardRule, other], standardRule)?.id).toBe(
      'rule-standard'
    );
  });

  it('falls back when the student points at a rule that no longer exists', () => {
    // Not billing them at all would be worse: an unbilled student is invisible,
    // and invisible is how revenue goes missing.
    expect(
      ruleForStudent({ billingRuleId: 'deleted' }, [standardRule], standardRule)?.id
    ).toBe('rule-standard');
  });
});

describe('planCharges', () => {
  let createIfAbsent: MockedFunction<PlanDeps['createIfAbsent']>;

  const deps = (over: Partial<PlanDeps> = {}): PlanDeps => ({
    rules: [standardRule],
    defaultRule: standardRule,
    rateByLength: { '30-min-full': 4125 },
    lessonsByStudent: new Map([['student-1', lessons(8)]]),
    createIfAbsent,
    ...over,
  });

  beforeEach(() => {
    createIfAbsent = vi.fn().mockResolvedValue({ id: 'created' });
  });

  it('plans one charge per block at the resolved rate', async () => {
    const result = await planCharges([student()], deps());

    expect(result.planned).toBe(2);
    expect(createIfAbsent).toHaveBeenCalledTimes(2);
    expect(createIfAbsent.mock.calls[0][0]).toMatchObject({
      id: 'chg-student-1-lesson-1',
      amountCents: 4 * 4125,
      lessonIds: ['lesson-1', 'lesson-2', 'lesson-3', 'lesson-4'],
    });
  });

  it('never plans a charge for a Hope student', async () => {
    // Hope bills through EMA. A charge here would bill a family for teaching
    // the state is paying for.
    const result = await planCharges(
      [student({ isHopeScholarship: true })],
      deps()
    );

    expect(result.planned).toBe(0);
    expect(createIfAbsent).not.toHaveBeenCalled();
  });

  it('never plans a charge for an inactive student', async () => {
    await planCharges([student({ status: 'inactive' })], deps());
    expect(createIfAbsent).not.toHaveBeenCalled();
  });

  it('plans nothing twice — a second run finds the charges already there', async () => {
    createIfAbsent.mockResolvedValue(null); // deterministic id already exists

    const result = await planCharges([student()], deps());

    expect(result.planned).toBe(0);
    expect(result.alreadyPlanned).toBe(2);
  });

  it('skips a charge that prices at zero rather than taking nothing', async () => {
    // No rate resolved. A $0 charge would look like a successful bill.
    const result = await planCharges(
      [student({ registeredLessonLength: undefined, lessonRateCents: 0 })],
      deps({ rateByLength: {} })
    );

    expect(result.planned).toBe(0);
    expect(result.skippedNoRate).toBe(2);
    expect(createIfAbsent).not.toHaveBeenCalled();
  });

  it('honours a per-student rate override', async () => {
    await planCharges([student({ lessonRateCents: 5000 })], deps());
    expect(createIfAbsent.mock.calls[0][0].amountCents).toBe(4 * 5000);
  });

  it('ignores an archived rule', async () => {
    await planCharges(
      [student()],
      deps({
        rules: [{ ...standardRule, archived: true }],
        defaultRule: { ...standardRule, archived: true },
      })
    );
    expect(createIfAbsent).not.toHaveBeenCalled();
  });
});

describe('chargeDue', () => {
  let claimLease: MockedFunction<ChargeDeps['claimLease']>;
  let markPaid: MockedFunction<ChargeDeps['markPaid']>;
  let markFailed: MockedFunction<ChargeDeps['markFailed']>;
  let chargeFn: MockedFunction<ChargeDeps['charge']>;

  const deps = (over: Partial<ChargeDeps> = {}): ChargeDeps => ({
    claimLease,
    markPaid,
    markFailed,
    charge: chargeFn,
    studentById: new Map([['student-1', student()]]),
    dryRun: false,
    ...over,
  });

  beforeEach(() => {
    claimLease = vi.fn().mockResolvedValue(true);
    markPaid = vi.fn().mockResolvedValue(undefined);
    markFailed = vi.fn().mockResolvedValue(undefined);
    chargeFn = vi.fn().mockResolvedValue('sqpmt_1');
  });

  it('charges a due charge against the stored card, with the stable key', async () => {
    const result = await chargeDue([charge()], deps(), NOW);

    expect(result.charged).toBe(1);
    expect(chargeFn).toHaveBeenCalledWith({
      customerId: 'cus_1',
      cardId: 'card_1',
      amountCents: 16500,
      idempotencyKey: 'lesson-chg-student-1-lesson-1',
    });
    expect(markPaid).toHaveBeenCalledWith('chg-student-1-lesson-1', 'sqpmt_1');
  });

  it('does not charge before the due date', async () => {
    const future = charge({ dueAt: new Date(NOW.getTime() + 86_400_000) });
    const result = await chargeDue([future], deps(), NOW);

    expect(result.charged).toBe(0);
    expect(chargeFn).not.toHaveBeenCalled();
  });

  it.each(['charging', 'paid', 'failed', 'cancelled', 'waived'] as const)(
    'does not charge a %s charge',
    async (status) => {
      await chargeDue([charge({ status })], deps(), NOW);
      expect(chargeFn).not.toHaveBeenCalled();
    }
  );

  it('does not charge when another run already holds the lease', async () => {
    // Two overlapping runs; only one wins the transaction.
    claimLease.mockResolvedValue(false);

    const result = await chargeDue([charge()], deps(), NOW);

    expect(result.charged).toBe(0);
    expect(chargeFn).not.toHaveBeenCalled();
  });

  it('re-checks eligibility at charge time, not just at planning time', async () => {
    // Planning and charging can be weeks apart. A student who has since left,
    // or moved onto Hope, must not be charged for a plan made before that.
    const result = await chargeDue(
      [charge()],
      deps({
        studentById: new Map([['student-1', student({ isHopeScholarship: true })]]),
      }),
      NOW
    );

    expect(result.charged).toBe(0);
    expect(claimLease).not.toHaveBeenCalled();
    expect(chargeFn).not.toHaveBeenCalled();
  });

  it('skips a family with no card rather than failing the charge', async () => {
    // No card is not a payment failure — it means they were never set up. The
    // charge stays scheduled so it goes through once a card is added.
    const result = await chargeDue(
      [charge()],
      deps({
        studentById: new Map([
          ['student-1', student({ squareCardId: undefined })],
        ]),
      }),
      NOW
    );

    expect(result.skippedNoCard).toBe(1);
    expect(claimLease).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
  });

  it('marks a declined card failed, loudly, without retrying', async () => {
    chargeFn.mockRejectedValue(new Error('CARD_DECLINED'));

    const result = await chargeDue([charge()], deps(), NOW);

    expect(result.failed).toBe(1);
    expect(markFailed).toHaveBeenCalledWith(
      'chg-student-1-lesson-1',
      'CARD_DECLINED'
    );
    expect(chargeFn).toHaveBeenCalledTimes(1); // no silent retry
  });

  it('takes no money on a dry run', async () => {
    const result = await chargeDue([charge()], deps({ dryRun: true }), NOW);

    expect(result.charged).toBe(1); // reported as would-charge
    expect(claimLease).not.toHaveBeenCalled();
    expect(chargeFn).not.toHaveBeenCalled();
  });
});
