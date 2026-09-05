import { describe, it, expect } from 'vitest';
import {
  describeBillingRule,
  isAutoChargeEligible,
  isChargeableLesson,
  planChargesForStudent,
  plannedChargeId,
} from './lesson-billing-rule';
import type { LessonBillingRule } from './lesson-billing-rule';
import type { Lesson } from './lesson';

/** David's example rule: 4 lessons every 4 weeks, charged the day before. */
function rule(
  overrides: Partial<LessonBillingRule> = {}
): Pick<
  LessonBillingRule,
  'id' | 'cadence' | 'lessonsPerCharge' | 'anchor' | 'anchorOffsetDays' | 'flatAmountCents'
> {
  return {
    id: 'rule-1',
    cadence: 'every-n-lessons',
    lessonsPerCharge: 4,
    anchor: 'before-first',
    anchorOffsetDays: -1,
    flatAmountCents: undefined,
    ...overrides,
  };
}

/** Weekly Tuesdays from 2026-06-02, 4:00pm ET (20:00Z in summer). */
function lessons(
  count: number,
  overrides: Partial<Lesson> = {}
): Array<Pick<Lesson, 'id' | 'scheduledAt' | 'status' | 'durationMinutes'>> {
  return Array.from({ length: count }, (_, i) => ({
    id: `lesson-${i + 1}`,
    scheduledAt: new Date(
      new Date('2026-06-02T20:00:00Z').getTime() + i * 7 * 86_400_000
    ),
    status: 'scheduled' as const,
    durationMinutes: 30,
    ...overrides,
  }));
}

const rate = () => 4125; // $41.25, the 30-min-full tier

describe('isAutoChargeEligible', () => {
  it('never charges a Hope student', () => {
    // Hope bills through the EMA portal, and createInvoice refuses them
    // outright. A rule reaching one would charge a family for teaching the
    // state is paying for.
    expect(
      isAutoChargeEligible({ status: 'active', isHopeScholarship: true })
    ).toBe(false);
  });

  it('never charges an inactive student', () => {
    expect(
      isAutoChargeEligible({ status: 'inactive', isHopeScholarship: false })
    ).toBe(false);
  });

  it('charges an active private-pay student', () => {
    expect(
      isAutoChargeEligible({ status: 'active', isHopeScholarship: false })
    ).toBe(true);
  });
});

describe('isChargeableLesson', () => {
  it.each([
    ['scheduled', true], // these rules bill AHEAD of the teaching
    ['rendered', true],
    ['no-show', true], // private pay is charged for a no-show (#796)
    ['cancelled', false],
  ] as const)('%s -> %s', (status, expected) => {
    expect(isChargeableLesson({ status })).toBe(expected);
  });
});

describe('planChargesForStudent', () => {
  it('charges once per block of lessons, a day before the first', () => {
    const planned = planChargesForStudent('s1', rule(), lessons(8), rate);

    expect(planned).toHaveLength(2);
    expect(planned[0].lessonIds).toEqual([
      'lesson-1',
      'lesson-2',
      'lesson-3',
      'lesson-4',
    ]);
    // Jun 2 minus one day.
    expect(planned[0].dueAt.toISOString()).toBe('2026-06-01T20:00:00.000Z');
    expect(planned[0].amountCents).toBe(4 * 4125);
    expect(planned[1].lessonIds[0]).toBe('lesson-5');
  });

  it('does NOT charge a trailing partial block', () => {
    // Six lessons, blocks of four: charging the leftover two as a block of four
    // would be taking money for teaching that has not been arranged.
    const planned = planChargesForStudent('s1', rule(), lessons(6), rate);

    expect(planned).toHaveLength(1);
    expect(planned[0].lessonIds).toHaveLength(4);
  });

  it('charges nothing when there are fewer lessons than a block', () => {
    expect(planChargesForStudent('s1', rule(), lessons(3), rate)).toEqual([]);
  });

  it('anchors to the last lesson when the rule says after', () => {
    const planned = planChargesForStudent(
      's1',
      rule({ anchor: 'after-last', anchorOffsetDays: 1 }),
      lessons(4),
      rate
    );

    // Fourth lesson is Jun 23; charge lands the day after.
    expect(planned[0].dueAt.toISOString()).toBe('2026-06-24T20:00:00.000Z');
  });

  it('anchors on the day of the first lesson at offset zero', () => {
    const planned = planChargesForStudent(
      's1',
      rule({ anchor: 'on-first', anchorOffsetDays: 0 }),
      lessons(4),
      rate
    );
    expect(planned[0].dueAt.toISOString()).toBe('2026-06-02T20:00:00.000Z');
  });

  it('bills each lesson separately on the per-lesson cadence', () => {
    const planned = planChargesForStudent(
      's1',
      rule({ cadence: 'per-lesson', lessonsPerCharge: 4 }),
      lessons(3),
      rate
    );

    // lessonsPerCharge is ignored for per-lesson — one charge each, and no
    // trailing block to drop.
    expect(planned).toHaveLength(3);
    expect(planned.every((p) => p.lessonIds.length === 1)).toBe(true);
    expect(planned[0].amountCents).toBe(4125);
  });

  it('uses a flat amount when the rule sets one', () => {
    const planned = planChargesForStudent(
      's1',
      rule({ flatAmountCents: 13000 }),
      lessons(4),
      rate
    );
    expect(planned[0].amountCents).toBe(13000);
  });

  it('excludes cancelled lessons from the blocks entirely', () => {
    // A cancelled lesson must not consume a slot in a block, or the family
    // pays for four and receives three.
    const all = lessons(5);
    all[1] = { ...all[1], status: 'cancelled' as Lesson['status'] };

    const planned = planChargesForStudent('s1', rule(), all, rate);

    expect(planned).toHaveLength(1);
    expect(planned[0].lessonIds).toEqual([
      'lesson-1',
      'lesson-3',
      'lesson-4',
      'lesson-5',
    ]);
  });

  it('blocks lessons in date order regardless of input order', () => {
    const shuffled = [...lessons(4)].reverse();
    const planned = planChargesForStudent('s1', rule(), shuffled, rate);

    expect(planned[0].lessonIds).toEqual([
      'lesson-1',
      'lesson-2',
      'lesson-3',
      'lesson-4',
    ]);
  });

  it('prices a mixed-length block from each lesson', () => {
    const mixed = lessons(2).concat(
      lessons(2).map((l, i) => ({
        ...l,
        id: `long-${i}`,
        durationMinutes: 60,
        scheduledAt: new Date(l.scheduledAt.getTime() + 14 * 86_400_000),
      }))
    );
    const byLength = (l: { durationMinutes: number }) =>
      l.durationMinutes >= 60 ? 7500 : 4125;

    const planned = planChargesForStudent('s1', rule(), mixed, byLength);

    expect(planned[0].amountCents).toBe(4125 * 2 + 7500 * 2);
  });
});

describe('plannedChargeId', () => {
  it('is keyed on the first lesson covered, not the due date', () => {
    // The due date moves whenever the anchor lesson is rescheduled. An id that
    // moved with it would let the same block be charged twice.
    const [charge] = planChargesForStudent('s1', rule(), lessons(4), rate);
    expect(plannedChargeId(charge)).toBe('chg-s1-lesson-1');

    const moved = planChargesForStudent(
      's1',
      rule(),
      lessons(4).map((l, i) =>
        i === 0 ? { ...l, scheduledAt: new Date('2026-06-03T20:00:00Z') } : l
      ),
      rate
    );
    expect(plannedChargeId(moved[0])).toBe('chg-s1-lesson-1');
  });

  it('differs between blocks', () => {
    const planned = planChargesForStudent('s1', rule(), lessons(8), rate);
    expect(plannedChargeId(planned[0])).not.toBe(plannedChargeId(planned[1]));
  });
});

describe('describeBillingRule', () => {
  it('states the rule the way Katie would say it', () => {
    expect(describeBillingRule(rule())).toBe(
      'Every 4 lessons, charged 1 day before the first lesson'
    );
  });

  it('describes a per-lesson rule', () => {
    expect(
      describeBillingRule(
        rule({ cadence: 'per-lesson', anchor: 'after-last', anchorOffsetDays: 1 })
      )
    ).toBe('Each lesson, charged 1 day after the last lesson');
  });

  it('drops the offset when there is none', () => {
    expect(
      describeBillingRule(rule({ anchor: 'on-first', anchorOffsetDays: 0 }))
    ).toBe('Every 4 lessons, charged on the first lesson');
  });
});
