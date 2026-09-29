import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREPAY_LESSON_COUNT,
  MAX_PREPAY_LESSON_COUNT,
  planPrepayment,
  prepayableLessons,
  describePrepaymentProblem,
  fillWeeklyLessonDates,
  unpaidTaughtLessons,
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

describe('picking lessons by hand', () => {
  const NOW = new Date('2026-09-10T12:00:00Z');
  const DAY = 86_400_000;
  const rate = () => 3500;

  const lesson = (n: number) => ({
    id: `lesson-${n}`,
    studentId: 'stu-1',
    scheduledAt: new Date(NOW.getTime() + n * 7 * DAY),
    durationMinutes: 30,
    status: 'scheduled' as const,
  });

  const lessons = [1, 2, 3, 4, 5, 6].map(lesson);

  it('refuses an empty selection instead of charging the next few (#106)', () => {
    // The manual picker sends `lessonIds: []` before anything is ticked. Falling
    // back to a count there meant the button offered "Charge $140.00 · 4
    // lessons" while every checkbox was clear — the screen and the charge
    // disagreeing about what the family agreed to.
    const outcome = planPrepayment(
      'stu-1',
      lessons,
      [],
      { lessonIds: [] },
      rate,
      NOW
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.problem).toBe('nothing-picked');
  });

  it('still falls back to the count when no selection was made at all', () => {
    // `lessonIds` absent is "I have not chosen, use the next N" — the automatic
    // mode. Only a *present* empty array means "nothing ticked".
    const outcome = planPrepayment(
      'stu-1',
      lessons,
      [],
      { lessonCount: 2 },
      rate,
      NOW
    );

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.plan.lessons).toHaveLength(2);
  });

  it('charges exactly what was ticked', () => {
    const outcome = planPrepayment(
      'stu-1',
      lessons,
      [],
      { lessonIds: ['lesson-2', 'lesson-4'] },
      rate,
      NOW
    );

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.plan.lessons.map((l) => l.id)).toEqual([
        'lesson-2',
        'lesson-4',
      ]);
      expect(outcome.plan.amountCents).toBe(7000);
    }
  });

  it('says what to do about an empty selection', () => {
    expect(describePrepaymentProblem('nothing-picked')).toBe(
      'Tick the lessons this payment covers.'
    );
  });
});

describe('unpaidTaughtLessons (#128)', () => {
  it('lists teaching already given that nobody paid for, newest first', () => {
    const lessons = [
      lesson('old', -21, 'rendered'),
      lesson('mid', -14, 'rendered'),
      lesson('recent', -7, 'rendered'),
    ];

    expect(
      unpaidTaughtLessons(lessons, [], NOW).map((l) => l.id)
    ).toEqual(['recent', 'mid', 'old']);
  });

  it('has no cutoff — a lesson from a year ago is still owed', () => {
    const lessons = [lesson('ancient', -400, 'rendered')];

    expect(unpaidTaughtLessons(lessons, [], NOW).map((l) => l.id)).toEqual([
      'ancient',
    ]);
  });

  it('bills a no-show, because studio policy charges for the slot', () => {
    const lessons = [lesson('missed', -3, 'no-show')];

    expect(unpaidTaughtLessons(lessons, [], NOW).map((l) => l.id)).toEqual([
      'missed',
    ]);
  });

  it('will not charge for a past lesson nobody marked taught', () => {
    // Still `scheduled` a week later: as far as this system knows the teaching
    // did not happen, and charging would invent the fact that it did.
    const lessons = [lesson('unmarked', -7, 'scheduled')];

    expect(unpaidTaughtLessons(lessons, [], NOW)).toEqual([]);
  });

  it('leaves a cancelled lesson alone', () => {
    const lessons = [lesson('called-off', -7, 'cancelled')];

    expect(unpaidTaughtLessons(lessons, [], NOW)).toEqual([]);
  });

  it('drops one a charge already covers', () => {
    const lessons = [lesson('paid-for', -7, 'rendered'), lesson('owed', -6, 'rendered')];

    expect(
      unpaidTaughtLessons(lessons, [charge('c1', ['paid-for'])], NOW).map(
        (l) => l.id
      )
    ).toEqual(['owed']);
  });

  it('drops one a live invoice already asks for — the card must not ask twice', () => {
    const lessons = [lesson('invoiced', -7, 'rendered'), lesson('owed', -6, 'rendered')];

    expect(
      unpaidTaughtLessons(lessons, [], NOW, new Set(['invoiced'])).map(
        (l) => l.id
      )
    ).toEqual(['owed']);
  });

  it('does not overlap prepayableLessons: today belongs to the forward set', () => {
    // A lesson taught earlier today is future-side, since the cutoff both
    // functions share is the studio's midnight. It must appear exactly once
    // across the two, or a picker showing both sections lists it twice.
    const lessons = [lesson('taught-today', 0, 'rendered')];

    expect(prepayableLessons(lessons, [], NOW).map((l) => l.id)).toEqual([
      'taught-today',
    ]);
    expect(unpaidTaughtLessons(lessons, [], NOW)).toEqual([]);
  });
});

describe('charging for teaching already given (#128)', () => {
  const taught = [
    lesson('t1', -14, 'rendered'),
    lesson('t2', -7, 'rendered'),
  ];
  const upcoming = [lesson('u1', 3), lesson('u2', 10)];
  const all = [...taught, ...upcoming];

  it('charges a past lesson when it is ticked by name', () => {
    const outcome = planPrepayment(
      'stu-1',
      all,
      [],
      { lessonIds: ['t2'] },
      rate,
      NOW
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.plan.lessons.map((l) => l.id)).toEqual(['t2']);
    expect(outcome.plan.amountCents).toBe(RATE);
  });

  it('charges past and upcoming lessons together in one payment', () => {
    const outcome = planPrepayment(
      'stu-1',
      all,
      [],
      { lessonIds: ['t1', 'u1'] },
      rate,
      NOW
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.plan.lessons.map((l) => l.id).sort()).toEqual(['t1', 'u1']);
    expect(outcome.plan.amountCents).toBe(2 * RATE);
  });

  it('never hands a past lesson to the "charge the next few" shortcut', () => {
    // The whole safety property: a count-based charge sells the teaching still
    // to come. Collecting a debt has to be ticked deliberately.
    const outcome = planPrepayment('stu-1', all, [], { lessonCount: 4 }, rate, NOW);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.plan.lessons.map((l) => l.id)).toEqual(['u1', 'u2']);
  });

  it('refuses a past lesson that is already covered, rather than charging the rest', () => {
    const outcome = planPrepayment(
      'stu-1',
      all,
      [charge('c1', ['t1'])],
      { lessonIds: ['t1', 't2'] },
      rate,
      NOW
    );

    expect(outcome).toEqual({ ok: false, problem: 'already-covered' });
  });

  it('refuses a past lesson nobody marked taught', () => {
    const outcome = planPrepayment(
      'stu-1',
      [lesson('unmarked', -7, 'scheduled')],
      [],
      { lessonIds: ['unmarked'] },
      rate,
      NOW
    );

    expect(outcome).toEqual({ ok: false, problem: 'already-covered' });
  });

  it('prices a past lesson by its own duration, like any other', () => {
    const long = { ...lesson('t-long', -7, 'rendered'), durationMinutes: 60 };
    const byDuration = (l: { durationMinutes: number }) =>
      l.durationMinutes === 60 ? RATE * 2 : RATE;

    const outcome = planPrepayment(
      'stu-1',
      [long],
      [],
      { lessonIds: ['t-long'] },
      byDuration,
      NOW
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.plan.amountCents).toBe(RATE * 2);
  });
});

describe('fillWeeklyLessonDates', () => {
  // Tue Sep 29 2026, 5:00 PM Eastern (EDT, UTC-4).
  const sep29 = new Date('2026-09-29T21:00:00Z');
  const oct13 = new Date('2026-10-13T21:00:00Z');
  const et = (d: Date) =>
    d.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

  it('fills the weeks between and after, not the ones already booked', () => {
    // Two lessons made by hand, a week apart from nothing: the next four
    // weeks are Sep 29, Oct 6, Oct 13, Oct 20, so Oct 6 and Oct 20 are missing.
    const dates = fillWeeklyLessonDates(
      { scheduledAt: sep29 },
      [
        { scheduledAt: sep29, status: 'scheduled' },
        { scheduledAt: oct13, status: 'scheduled' },
      ],
      2
    );
    expect(dates.map(et)).toEqual([
      'Tue, Oct 6, 5:00 PM',
      'Tue, Oct 20, 5:00 PM',
    ]);
  });

  it('keeps the wall-clock time across the change back from daylight time', () => {
    // Nov 1 2026 is the fall-back date: 5:00 PM stays 5:00 PM, which is a
    // different UTC hour.
    const dates = fillWeeklyLessonDates(
      { scheduledAt: new Date('2026-10-27T21:00:00Z') },
      [{ scheduledAt: new Date('2026-10-27T21:00:00Z'), status: 'scheduled' }],
      1
    );
    expect(et(dates[0])).toBe('Tue, Nov 3, 5:00 PM');
    expect(dates[0].toISOString()).toBe('2026-11-03T22:00:00.000Z');
  });

  it('treats a week with a moved lesson as booked', () => {
    // The Oct 6 lesson was moved to the Monday; that week is still covered.
    const dates = fillWeeklyLessonDates(
      { scheduledAt: sep29 },
      [
        { scheduledAt: sep29, status: 'scheduled' },
        { scheduledAt: new Date('2026-10-05T21:00:00Z'), status: 'scheduled' },
      ],
      1
    );
    expect(et(dates[0])).toBe('Tue, Oct 13, 5:00 PM');
  });

  it('refills a week whose lesson was cancelled', () => {
    const dates = fillWeeklyLessonDates(
      { scheduledAt: sep29 },
      [
        { scheduledAt: sep29, status: 'scheduled' },
        { scheduledAt: new Date('2026-10-06T21:00:00Z'), status: 'cancelled' },
      ],
      1
    );
    expect(et(dates[0])).toBe('Tue, Oct 6, 5:00 PM');
  });

  it('asks for nothing when nothing is needed', () => {
    expect(fillWeeklyLessonDates({ scheduledAt: sep29 }, [], 0)).toEqual([]);
  });
});
