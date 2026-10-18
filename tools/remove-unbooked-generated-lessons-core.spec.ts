import { describe, expect, it } from 'vitest';
import { lessonsToRemove } from './remove-unbooked-generated-lessons-core';

const NOW = new Date('2026-10-05T12:00:00Z');
const weeks = (n: number) => new Date(NOW.getTime() + n * 7 * 86_400_000);
const lesson = (id: string, weeksOut: number, status = 'scheduled') => ({
  id,
  status,
  scheduledAt: weeks(weeksOut),
});

describe('lessonsToRemove (#157)', () => {
  it('removes an unpaid generated lesson four or more weeks out', () => {
    const lessons = [lesson('sched-a-1', 4), lesson('sched-a-2', 6)];

    expect(lessonsToRemove(lessons, new Set(), NOW).map((l) => l.id)).toEqual([
      'sched-a-1',
      'sched-a-2',
    ]);
  });

  it('keeps the lessons nearer than four weeks', () => {
    expect(lessonsToRemove([lesson('sched-a-1', 3.9)], new Set(), NOW)).toEqual(
      []
    );
  });

  it('never touches a lesson booked by hand', () => {
    expect(lessonsToRemove([lesson('lesson-xyz', 8)], new Set(), NOW)).toEqual(
      []
    );
  });

  it('keeps a lesson that is paid for or invoiced', () => {
    expect(
      lessonsToRemove([lesson('sched-a-1', 8)], new Set(['sched-a-1']), NOW)
    ).toEqual([]);
  });

  it.each(['cancelled', 'rendered', 'no-show'])(
    'leaves a %s lesson alone',
    (status) => {
      expect(
        lessonsToRemove([lesson('sched-a-1', 8, status)], new Set(), NOW)
      ).toEqual([]);
    }
  );

  it('respects a different horizon', () => {
    expect(
      lessonsToRemove([lesson('sched-a-1', 2)], new Set(), NOW, 1).map(
        (l) => l.id
      )
    ).toEqual(['sched-a-1']);
  });

  it('lists soonest first', () => {
    const lessons = [lesson('sched-b', 9), lesson('sched-a', 5)];

    expect(lessonsToRemove(lessons, new Set(), NOW).map((l) => l.id)).toEqual([
      'sched-a',
      'sched-b',
    ]);
  });
});
