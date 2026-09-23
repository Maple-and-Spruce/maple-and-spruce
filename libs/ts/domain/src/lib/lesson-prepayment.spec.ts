import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREPAY_LESSON_COUNT,
  MAX_PREPAY_LESSON_COUNT,
  planPrepayment,
  prepayableLessons,
  describePrepaymentProblem,
} from './lesson-prepayment';
import { planChargesForStudent } from './lesson-billing-rule';
import {
  chargeCoversItsLessons,
  coveredLessonIds,
} from './lesson-scheduled-charge';
import type { LessonScheduledCharge } from './lesson-scheduled-charge';
import type { Lesson } from './lesson';

const NOW = new Date('2026-03-10T12:00:00Z');
const RATE = 4500;
const rate = () => RATE;

function lesson(
  id: string,
  daysFromNow: number,
  status: Lesson['status'] = 'scheduled'
): Pick<Lesson, 'id' | 'scheduledAt' | 'status' | 'durationMinutes'> {
  return {
    id,
    scheduledAt: new Date(NOW.getTime() + daysFromNow * 86_400_000),
    status,
    durationMinutes: 30,
  };
}

function charge(
  id: string,
  lessonIds: string[],
  status: LessonScheduledCharge['status'] = 'paid'
): LessonScheduledCharge {
  return {
    id,
    studentId: 'stu-1',
    ruleId: 'rule-1',
    lessonIds,
    amountCents: lessonIds.length * RATE,
    dueAt: NOW,
    status,
    idempotencyKey: `lesson-${id}`,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('prepayableLessons', () => {
  const lessons = [
    lesson('l0', -3),
    lesson('l1', 1),
    lesson('l2', 8),
    lesson('l3', 15),
  ];

  it('offers upcoming chargeable lessons in date order', () => {
    expect(prepayableLessons(lessons, [], NOW).map((l) => l.id)).toEqual([
      'l1',
      'l2',
      'l3',
    ]);
  });

  it('keeps a lesson taught earlier today, so a family can settle at the door', () => {
    const earlierToday = {
      ...lesson('today', 0),
      scheduledAt: new Date('2026-03-10T09:00:00Z'),
      status: 'rendered' as const,
    };
    const ids = prepayableLessons([earlierToday], [], NOW).map((l) => l.id);
    expect(ids).toEqual(['today']);
  });

  it('drops a cancelled lesson — it is not teaching anyone can pay for', () => {
    const ids = prepayableLessons(
      [lesson('l1', 1, 'cancelled'), lesson('l2', 2)],
      [],
      NOW
    ).map((l) => l.id);
    expect(ids).toEqual(['l2']);
  });

  it('drops lessons an existing charge already covers', () => {
    const ids = prepayableLessons(
      lessons,
      [charge('chg-stu-1-l1', ['l1', 'l2'])],
      NOW
    ).map((l) => l.id);
    expect(ids).toEqual(['l3']);
  });

  it('does not re-offer lessons under a FAILED charge — that charge still holds them', () => {
    // The recovery for a failed charge is Try again on the charge itself. When
    // these lessons were re-offered instead, a second charge could overlap the
    // failed one and retrying both took payment twice for the same lesson
    // (#102).
    const ids = prepayableLessons(
      lessons,
      [charge('chg-stu-1-l1', ['l1', 'l2'], 'failed')],
      NOW
    ).map((l) => l.id);
    expect(ids).toEqual(['l3']);
  });

  it('does not offer a lesson a live invoice already asks the family to pay', () => {
    // Invoicing is explicit now, so an invoice is a deliberate ask. Charging
    // the card for the same lesson would bill it twice (#101).
    const ids = prepayableLessons(
      lessons,
      [],
      NOW,
      new Set(['l1'])
    ).map((l) => l.id);
    expect(ids).toEqual(['l2', 'l3']);
  });

  it('offers it again once that invoice is voided', () => {
    // A voided invoice is a cancelled ask; the lesson is owed again. The caller
    // passes the ids, and `invoicedLessonIds` is what drops void invoices.
    const ids = prepayableLessons(lessons, [], NOW, new Set()).map((l) => l.id);
    expect(ids).toEqual(['l1', 'l2', 'l3']);
  });

  it('does not re-offer waived lessons — the studio chose not to charge', () => {
    const ids = prepayableLessons(
      lessons,
      [charge('chg-stu-1-l1', ['l1'], 'waived')],
      NOW
    ).map((l) => l.id);
    expect(ids).toEqual(['l2', 'l3']);
  });

  describe('the day boundary is the studio’s, not the runtime’s', () => {
    // 11:15pm Eastern on 21 September — which is already the 22nd in UTC.
    const LATE_EVENING_ET = new Date('2026-09-22T03:15:00Z');
    // The lesson taught at 5:30pm that same Eastern evening.
    const TAUGHT_EARLIER_TODAY = new Date('2026-09-21T21:30:00Z');

    const todaysLesson = {
      id: 'today',
      scheduledAt: TAUGHT_EARLIER_TODAY,
      status: 'rendered' as const,
      durationMinutes: 30,
    };

    it('still offers a lesson taught earlier the same evening', () => {
      // On Cloud Run (UTC) the day had already rolled over, so the server
      // dropped this lesson and the admin was told it was "already covered by
      // another charge" — untrue, and unfixable by the reload it suggested.
      // After 8pm Eastern that made Pay ahead unusable for anyone taught that
      // day (#103).
      const ids = prepayableLessons(
        [todaysLesson],
        [],
        LATE_EVENING_ET
      ).map((l) => l.id);
      expect(ids).toEqual(['today']);
    });

    it('still drops a lesson from the previous studio day', () => {
      const yesterday = {
        ...todaysLesson,
        id: 'yesterday',
        scheduledAt: new Date('2026-09-20T21:30:00Z'),
      };
      expect(prepayableLessons([yesterday], [], LATE_EVENING_ET)).toEqual([]);
    });
  });
});

describe('planPrepayment', () => {
  const lessons = Array.from({ length: 10 }, (_, i) => lesson(`l${i}`, i + 1));

  it('defaults to the next four lessons', () => {
    const outcome = planPrepayment('stu-1', lessons, [], {}, rate, NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.plan.lessons).toHaveLength(DEFAULT_PREPAY_LESSON_COUNT);
    expect(outcome.plan.lessons.map((l) => l.id)).toEqual([
      'l0',
      'l1',
      'l2',
      'l3',
    ]);
    expect(outcome.plan.amountCents).toBe(4 * RATE);
  });

  it('takes the id scheme an automatically planned charge would use', () => {
    const outcome = planPrepayment('stu-1', lessons, [], {}, rate, NOW);
    if (!outcome.ok) throw new Error('expected a plan');
    expect(outcome.plan.chargeId).toBe('chg-stu-1-l0');
  });

  it('honours an explicit lesson selection over the count', () => {
    const outcome = planPrepayment(
      'stu-1',
      lessons,
      [],
      { lessonIds: ['l2', 'l5'], lessonCount: 4 },
      rate,
      NOW
    );
    if (!outcome.ok) throw new Error('expected a plan');
    expect(outcome.plan.lessons.map((l) => l.id)).toEqual(['l2', 'l5']);
    expect(outcome.plan.amountCents).toBe(2 * RATE);
  });

  it('refuses a selection containing an already-covered lesson', () => {
    const outcome = planPrepayment(
      'stu-1',
      lessons,
      [charge('chg-stu-1-l2', ['l2'])],
      { lessonIds: ['l2', 'l3'] },
      rate,
      NOW
    );
    expect(outcome).toEqual({ ok: false, problem: 'already-covered' });
  });

  it('skips covered lessons when counting forward', () => {
    const outcome = planPrepayment(
      'stu-1',
      lessons,
      [charge('chg-stu-1-l0', ['l0', 'l1'])],
      { lessonCount: 2 },
      rate,
      NOW
    );
    if (!outcome.ok) throw new Error('expected a plan');
    expect(outcome.plan.lessons.map((l) => l.id)).toEqual(['l2', 'l3']);
  });

  it('refuses when no rate resolves, rather than recording a $0 payment', () => {
    const outcome = planPrepayment('stu-1', lessons, [], {}, () => 0, NOW);
    expect(outcome).toEqual({ ok: false, problem: 'no-rate' });
  });

  it('refuses when every lesson is already covered', () => {
    const outcome = planPrepayment(
      'stu-1',
      lessons,
      [charge('chg-stu-1-l0', lessons.map((l) => l.id))],
      {},
      rate,
      NOW
    );
    expect(outcome).toEqual({ ok: false, problem: 'no-lessons' });
  });

  it('refuses more lessons than one payment may cover', () => {
    const many = Array.from({ length: 40 }, (_, i) => lesson(`m${i}`, i + 1));
    const outcome = planPrepayment(
      'stu-1',
      many,
      [],
      { lessonCount: MAX_PREPAY_LESSON_COUNT + 1 },
      rate,
      NOW
    );
    expect(outcome).toEqual({ ok: false, problem: 'too-many' });
  });

  it('explains every problem it can report', () => {
    for (const problem of [
      'no-lessons',
      'already-covered',
      'no-rate',
      'too-many',
    ] as const) {
      expect(describePrepaymentProblem(problem).length).toBeGreaterThan(10);
    }
  });
});

describe('a prepayment suppresses autopay', () => {
  const rule = {
    id: 'rule-1',
    cadence: 'every-n-lessons' as const,
    lessonsPerCharge: 4,
    anchor: 'before-first' as const,
    anchorOffsetDays: -1,
  };
  const lessons = Array.from({ length: 8 }, (_, i) => lesson(`l${i}`, i + 1));

  it('plans nothing over lessons a paid charge already covers', () => {
    const paid = charge('chg-stu-1-l0', ['l0', 'l1', 'l2', 'l3']);
    const planned = planChargesForStudent(
      'stu-1',
      rule,
      lessons,
      rate,
      coveredLessonIds([paid])
    );
    expect(planned).toHaveLength(1);
    expect(planned[0].lessonIds).toEqual(['l4', 'l5', 'l6', 'l7']);
  });

  it('re-blocks around a prepayment that did not land on a block boundary', () => {
    // Katie prepaid two lessons out of the middle. Without the covered filter
    // the blocks would still start at l0 and charge l2/l3 a second time.
    const paid = charge('chg-stu-1-l2', ['l2', 'l3']);
    const planned = planChargesForStudent(
      'stu-1',
      rule,
      lessons,
      rate,
      coveredLessonIds([paid])
    );
    expect(planned).toHaveLength(1);
    expect(planned[0].lessonIds).toEqual(['l0', 'l1', 'l4', 'l5']);
    expect(
      planned.flatMap((p) => p.lessonIds).filter((id) => id === 'l2')
    ).toHaveLength(0);
  });

  it('does not double-charge when a paid block’s first lesson is cancelled', () => {
    // The regression the covered filter closes: the block re-forms around a
    // different first lesson, so its deterministic id changes and the
    // createIfAbsent collision that normally means "already handled" never
    // fires.
    const paid = charge('chg-stu-1-l0', ['l0', 'l1', 'l2', 'l3']);
    const afterCancel = lessons.map((l) =>
      l.id === 'l0' ? { ...l, status: 'cancelled' as const } : l
    );

    const naive = planChargesForStudent('stu-1', rule, afterCancel, rate);
    expect(naive[0].lessonIds).toEqual(['l1', 'l2', 'l3', 'l4']);

    const guarded = planChargesForStudent(
      'stu-1',
      rule,
      afterCancel,
      rate,
      coveredLessonIds([paid])
    );
    expect(guarded[0].lessonIds).toEqual(['l4', 'l5', 'l6', 'l7']);
  });

  it('does not re-plan a failed charge’s lessons — the charge already holds them', () => {
    // Re-planning them produced the same deterministic id as the failed
    // charge, the create collided, and the throw aborted the whole daily run
    // for every student (#100). The way out of a failed charge is Try again,
    // or waiving/cancelling it.
    const failed = charge('chg-stu-1-l0', ['l0', 'l1', 'l2', 'l3'], 'failed');
    expect(chargeCoversItsLessons(failed)).toBe(true);
    const planned = planChargesForStudent(
      'stu-1',
      rule,
      lessons,
      rate,
      coveredLessonIds([failed])
    );
    expect(planned[0].lessonIds).toEqual(['l4', 'l5', 'l6', 'l7']);
  });
});
