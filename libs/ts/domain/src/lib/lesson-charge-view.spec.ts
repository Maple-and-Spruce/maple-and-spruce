/**
 * Grouping charges for the screen Katie reads before money moves (#81).
 *
 * The daily job plans and takes charges with nobody watching, so this decides
 * what she is shown. The bar: nothing actionable may be hidden, and anything
 * that is money already earned but not collected has to outrank the future.
 */
import { describe, it, expect } from 'vitest';
import {
  canStopCharge,
  describeChargeStatus,
  groupLessonCharges,
  totalCents,
} from './lesson-charge-view';
import type { LessonScheduledCharge } from './lesson-scheduled-charge';

const NOW = new Date('2026-09-10T12:00:00Z');
const DAY = 86_400_000;

let seq = 0;
function charge(over: Partial<LessonScheduledCharge> = {}): LessonScheduledCharge {
  seq++;
  return {
    id: `chg-${seq}`,
    studentId: 'student-1',
    ruleId: 'rule-1',
    lessonIds: ['l1', 'l2', 'l3', 'l4'],
    amountCents: 16500,
    dueAt: new Date(NOW.getTime() + DAY),
    status: 'scheduled',
    idempotencyKey: `lesson-chg-${seq}`,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

describe('grouping', () => {
  it('separates what is coming from what has already gone wrong', () => {
    const groups = groupLessonCharges(
      [
        charge({ status: 'scheduled', dueAt: new Date(NOW.getTime() + 7 * DAY) }),
        charge({ status: 'failed', dueAt: new Date(NOW.getTime() - 2 * DAY) }),
        charge({ status: 'scheduled', dueAt: new Date(NOW.getTime() - DAY) }),
        charge({ status: 'paid', dueAt: new Date(NOW.getTime() - 5 * DAY) }),
      ],
      NOW
    );

    expect(groups.failed).toHaveLength(1);
    expect(groups.dueNow).toHaveLength(1);
    expect(groups.upcoming).toHaveLength(1);
    expect(groups.settled).toHaveLength(1);
  });

  it('treats a charge in flight as due, not as upcoming', () => {
    // `charging` cannot be stopped, but hiding it would mean money moving
    // with nothing on screen about it.
    const groups = groupLessonCharges([charge({ status: 'charging' })], NOW);

    expect(groups.dueNow).toHaveLength(1);
    expect(groups.upcoming).toEqual([]);
  });

  it('counts an overdue scheduled charge as due, not settled', () => {
    // This is the shape of a family with no card on file: the job keeps
    // skipping it, so it sits here rather than quietly ageing out of view.
    const groups = groupLessonCharges(
      [charge({ status: 'scheduled', dueAt: new Date(NOW.getTime() - 30 * DAY) })],
      NOW
    );

    expect(groups.dueNow).toHaveLength(1);
    expect(groups.settled).toEqual([]);
  });

  it.each(['paid', 'cancelled', 'waived'] as const)(
    'settles a %s charge',
    (status) => {
      const groups = groupLessonCharges([charge({ status })], NOW);
      expect(groups.settled).toHaveLength(1);
    }
  );

  it('orders what is coming soonest first, and what failed most recently first', () => {
    const soon = charge({ dueAt: new Date(NOW.getTime() + DAY) });
    const later = charge({ dueAt: new Date(NOW.getTime() + 10 * DAY) });
    const oldFail = charge({ status: 'failed', dueAt: new Date(NOW.getTime() - 20 * DAY) });
    const newFail = charge({ status: 'failed', dueAt: new Date(NOW.getTime() - DAY) });

    const groups = groupLessonCharges([later, soon, oldFail, newFail], NOW);

    expect(groups.upcoming.map((c) => c.id)).toEqual([soon.id, later.id]);
    expect(groups.failed.map((c) => c.id)).toEqual([newFail.id, oldFail.id]);
  });
});

describe('stopping a charge', () => {
  it('can stop one that is only scheduled', () => {
    expect(canStopCharge({ status: 'scheduled' })).toBe(true);
  });

  it.each(['charging', 'paid', 'failed', 'cancelled', 'waived'] as const)(
    'cannot stop a %s charge',
    (status) => {
      expect(canStopCharge({ status })).toBe(false);
    }
  );
});

describe('how a charge reads', () => {
  it('carries the failure reason, because that is the actionable part', () => {
    expect(
      describeChargeStatus({ status: 'failed', lastError: 'CARD_DECLINED' })
    ).toBe('Failed: CARD_DECLINED');
  });

  it('carries the waiver reason, so a comped block stays legible', () => {
    expect(
      describeChargeStatus({ status: 'waived', waivedReason: 'Makeup for a cancelled lesson' })
    ).toBe('Waived: Makeup for a cancelled lesson');
  });

  it('says a charge in flight is being charged now, not "in progress"', () => {
    // From Katie's side the money is already gone; the only open question is
    // whether it lands.
    expect(describeChargeStatus({ status: 'charging' })).toBe('Being charged now');
  });
});

describe('totals', () => {
  it('adds up a set of charges', () => {
    expect(
      totalCents([charge({ amountCents: 16500 }), charge({ amountCents: 4125 })])
    ).toBe(20625);
  });

  it('is zero for nothing', () => {
    expect(totalCents([])).toBe(0);
  });
});
