import { describe, it, expect } from 'vitest';
import {
  addWeeksOnWallClock,
  isValidPushWeeks,
  planPushLessonsBack,
} from './push-lessons-back';
import type { Lesson } from './lesson';

type L = Pick<Lesson, 'id' | 'studentId' | 'scheduledAt' | 'status'>;

function lesson(id: string, iso: string, overrides: Partial<L> = {}): L {
  return {
    id,
    studentId: 'stu-1',
    scheduledAt: new Date(iso),
    status: 'scheduled',
    ...overrides,
  };
}

describe('addWeeksOnWallClock', () => {
  it('keeps noon at noon across the end of daylight time', () => {
    // Tue Oct 27 2026 12:00 EDT -> Tue Nov 3 2026 12:00 EST
    expect(
      addWeeksOnWallClock(new Date('2026-10-27T16:00:00Z'), 1).toISOString()
    ).toBe('2026-11-03T17:00:00.000Z');
  });

  it('keeps the time across the start of daylight time', () => {
    // Tue Mar 3 2026 17:00 EST -> Tue Mar 10 2026 17:00 EDT
    expect(
      addWeeksOnWallClock(new Date('2026-03-03T22:00:00Z'), 1).toISOString()
    ).toBe('2026-03-10T21:00:00.000Z');
  });

  it('rolls over a month and a year end', () => {
    // Tue Dec 29 2026 17:00 EST -> Tue Jan 12 2027 17:00 EST
    expect(
      addWeeksOnWallClock(new Date('2026-12-29T22:00:00Z'), 2).toISOString()
    ).toBe('2027-01-12T22:00:00.000Z');
  });

  it('uses the studio date, not the UTC date, for an evening lesson', () => {
    // Tue Nov 3 2026 8:00pm EST is already Wednesday in UTC.
    expect(
      addWeeksOnWallClock(new Date('2026-11-04T01:00:00Z'), 1).toISOString()
    ).toBe('2026-11-11T01:00:00.000Z');
  });
});

describe('planPushLessonsBack', () => {
  const oct27 = lesson('a', '2026-10-27T16:00:00Z');
  const nov3 = lesson('b', '2026-11-03T17:00:00Z');
  const nov10 = lesson('c', '2026-11-10T17:00:00Z');

  it('moves the lesson and every later one a week, latest first', () => {
    const plan = planPushLessonsBack(oct27, [nov3, oct27, nov10]);
    expect(plan.map((p) => [p.lesson.id, p.to.toISOString()])).toEqual([
      ['c', '2026-11-17T17:00:00.000Z'],
      ['b', '2026-11-10T17:00:00.000Z'],
      ['a', '2026-11-03T17:00:00.000Z'],
    ]);
  });

  it('leaves earlier lessons where they are', () => {
    const plan = planPushLessonsBack(nov3, [oct27, nov3, nov10]);
    expect(plan.map((p) => p.lesson.id)).toEqual(['c', 'b']);
  });

  it('leaves taught, missed and cancelled lessons alone', () => {
    const plan = planPushLessonsBack(oct27, [
      oct27,
      lesson('t', '2026-11-03T17:00:00Z', { status: 'rendered' }),
      lesson('n', '2026-11-10T17:00:00Z', { status: 'no-show' }),
      lesson('x', '2026-11-17T17:00:00Z', { status: 'cancelled' }),
    ]);
    expect(plan.map((p) => p.lesson.id)).toEqual(['a']);
  });

  it("never moves another student's lessons", () => {
    const plan = planPushLessonsBack(oct27, [
      oct27,
      lesson('other', '2026-11-03T17:00:00Z', { studentId: 'stu-2' }),
    ]);
    expect(plan.map((p) => p.lesson.id)).toEqual(['a']);
  });

  it('moves by more than one week when asked', () => {
    const [only] = planPushLessonsBack(oct27, [oct27], 2);
    expect(only.to.toISOString()).toBe('2026-11-10T17:00:00.000Z');
  });
});

describe('isValidPushWeeks', () => {
  it.each([1, 2, 4])('accepts %s', (w) => expect(isValidPushWeeks(w)).toBe(true));
  it.each([0, -1, 5, 1.5, '1', undefined])('refuses %s', (w) =>
    expect(isValidPushWeeks(w)).toBe(false)
  );
});
