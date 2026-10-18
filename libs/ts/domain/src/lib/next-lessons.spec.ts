import { describe, expect, it } from 'vitest';
import type { Invoice } from './invoice';
import type { Lesson } from './lesson';
import type { LessonScheduledCharge } from './lesson-scheduled-charge';
import type { StudentLessonSchedule } from './student-lesson-schedule';
import {
  buildNextLessons,
  isLessonPaid,
  newLessonKey,
  paidThrough,
} from './next-lessons';

// Monday 9 March 2026, 8:00 AM Eastern. Weekly time: Tuesdays 4:00 PM (20:00Z),
// so tomorrow's slot is the first of the next four.
const NOW = new Date('2026-03-09T12:00:00Z');
const schedule: StudentLessonSchedule = {
  id: 'sched-1',
  studentId: 'stu-1',
  teacherId: 'teacher-1',
  blockId: 'block-1',
  dayOfWeek: 2,
  startMinutes: 16 * 60,
  durationMinutes: 45,
  startsOn: new Date('2026-01-06T05:00:00Z'),
  status: 'active',
  createdAt: NOW,
  updatedAt: NOW,
};

const lesson = (id: string, iso: string): Lesson => ({
  id,
  studentId: 'stu-1',
  teacherId: 'teacher-1',
  scheduledAt: new Date(iso),
  durationMinutes: 45,
  status: 'scheduled',
  createdAt: NOW,
  updatedAt: NOW,
});

const paidCharge = (lessonIds: string[]): LessonScheduledCharge => ({
  id: 'chg-1',
  studentId: 'stu-1',
  ruleId: 'manual',
  lessonIds,
  amountCents: 4000 * lessonIds.length,
  dueAt: NOW,
  status: 'paid',
  idempotencyKey: 'k',
  resolvedAt: NOW,
  createdAt: NOW,
  updatedAt: NOW,
});

const invoice = (lessonId: string, status: Invoice['status']): Invoice => ({
  id: `inv-${lessonId}`,
  studentId: 'stu-1',
  status,
  lineItems: [
    {
      id: 'l1',
      description: 'Lesson',
      lessonId,
      quantity: 1,
      unitAmountCents: 4000,
      subtotalCents: 4000,
    },
  ],
  totalCents: 4000,
  createdAt: NOW,
  updatedAt: NOW,
});

const base = {
  schedule,
  lessons: [] as Lesson[],
  charges: [] as LessonScheduledCharge[],
  invoicedIds: new Set<string>(),
  now: NOW,
};
const iso = (d: Date) => d.toISOString();

describe('buildNextLessons', () => {
  it('proposes four dates from the weekly time, at its length', () => {
    const view = buildNextLessons(base);

    expect(view.noSlot).toBe(false);
    expect(view.items.map((i) => iso(i.scheduledAt))).toEqual([
      '2026-03-10T20:00:00.000Z',
      '2026-03-17T20:00:00.000Z',
      '2026-03-24T20:00:00.000Z',
      '2026-03-31T20:00:00.000Z',
    ]);
    expect(view.items.every((i) => i.durationMinutes === 45)).toBe(true);
    expect(view.items.every((i) => i.lessonId === undefined)).toBe(true);
  });

  it('includes booked, unpaid lessons and carries their ids', () => {
    const booked = lesson('lesson-a', '2026-03-17T20:00:00Z');

    const view = buildNextLessons({ ...base, lessons: [booked] });

    expect(view.items[0]).toMatchObject({ key: 'lesson-a', lessonId: 'lesson-a' });
    expect(view.items).toHaveLength(4);
  });

  it('replaces a skipped week with the following one', () => {
    const skipped = new Set([newLessonKey(new Date('2026-03-17T20:00:00Z'))]);

    const view = buildNextLessons({ ...base, skipped });

    expect(view.items.map((i) => iso(i.scheduledAt))).toEqual([
      '2026-03-10T20:00:00.000Z',
      '2026-03-24T20:00:00.000Z',
      '2026-03-31T20:00:00.000Z',
      '2026-04-07T20:00:00.000Z',
    ]);
  });

  it('can skip a booked lesson out of this payment without deleting it', () => {
    const booked = lesson('lesson-a', '2026-03-17T20:00:00Z');

    const view = buildNextLessons({
      ...base,
      lessons: [booked],
      skipped: new Set(['lesson-a']),
    });

    expect(view.items.map((i) => i.key)).not.toContain('lesson-a');
    expect(view.items).toHaveLength(4);
  });

  it('moves a date to be booked, keeping its key so the move sticks', () => {
    const key = newLessonKey(new Date('2026-03-17T20:00:00Z'));
    const thursday = new Date('2026-03-19T21:00:00Z');

    const view = buildNextLessons({ ...base, moved: new Map([[key, thursday]]) });

    const item = view.items.find((i) => i.key === key);
    expect(item?.scheduledAt).toEqual(thursday);
  });

  it('keeps the four in date order after a move', () => {
    const key = newLessonKey(new Date('2026-03-10T20:00:00Z'));

    const view = buildNextLessons({
      ...base,
      moved: new Map([[key, new Date('2026-03-20T20:00:00Z')]]),
    });

    const times = view.items.map((i) => i.scheduledAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('says when there is no weekly time', () => {
    const view = buildNextLessons({ ...base, schedule: undefined });

    expect(view).toEqual({ items: [], noSlot: true });
  });
});

describe('isLessonPaid', () => {
  it('counts a paid card charge', () => {
    expect(isLessonPaid('a', [paidCharge(['a'])], [])).toBe(true);
  });

  it('counts a paid invoice', () => {
    expect(isLessonPaid('a', [], [invoice('a', 'paid')])).toBe(true);
  });

  it('does not count an invoice that was only sent', () => {
    expect(isLessonPaid('a', [], [invoice('a', 'sent')])).toBe(false);
  });

  it('does not count nothing', () => {
    expect(isLessonPaid('a', [], [])).toBe(false);
  });
});

describe('paidThrough', () => {
  it('is the last upcoming lesson that is paid for', () => {
    const lessons = [
      lesson('a', '2026-03-17T20:00:00Z'),
      lesson('b', '2026-03-24T20:00:00Z'),
      lesson('c', '2026-03-31T20:00:00Z'),
    ];

    expect(
      paidThrough(lessons, [paidCharge(['a', 'b'])], [], NOW)?.toISOString()
    ).toBe('2026-03-24T20:00:00.000Z');
  });

  it('ignores past and cancelled lessons', () => {
    const lessons = [
      lesson('past', '2026-03-03T20:00:00Z'),
      { ...lesson('gone', '2026-03-24T20:00:00Z'), status: 'cancelled' as const },
    ];

    expect(
      paidThrough(lessons, [paidCharge(['past', 'gone'])], [], NOW)
    ).toBeUndefined();
  });
});
