import { describe, expect, it } from 'vitest';
import type { Instructor, LessonBlock, Student } from '@maple/ts/domain';
import {
  blockInvoiceInput,
  defaultDurationFor,
  paidLessonsInvoiceInput,
  planFillBlock,
} from './student-billing';

const NOW = new Date('2026-10-01T12:00:00Z');

const student: Student = {
  id: 'stu-1',
  name: 'Robin Ashfield',
  instrument: 'violin',
  isAdultStudent: false,
  primaryTeacherId: 'teacher-1',
  isHopeScholarship: false,
  lessonRateCents: 4000,
  status: 'active',
  createdAt: NOW,
  updatedAt: NOW,
};

const lessons = [
  { id: 'a', scheduledAt: new Date('2026-10-06T20:00:00Z'), durationMinutes: 30 },
  { id: 'b', scheduledAt: new Date('2026-10-13T20:00:00Z'), durationMinutes: 30 },
  { id: 'c', scheduledAt: new Date('2026-10-20T20:00:00Z'), durationMinutes: 30 },
];

describe('defaultDurationFor', () => {
  it.each([
    ['45-min', 45],
    ['60-min', 60],
    ['30-min-full', 30],
    [undefined, 30],
  ] as const)('%s → %d minutes', (length, minutes) => {
    expect(defaultDurationFor({ ...student, registeredLessonLength: length })).toBe(
      minutes
    );
  });
});

describe('blockInvoiceInput', () => {
  it('is one sent invoice with a line per lesson, each naming its lesson', () => {
    const input = blockInvoiceInput(
      student,
      { lessons, amountCents: 12000, note: 'October' },
      {}
    );

    expect(input).toMatchObject({ studentId: 'stu-1', status: 'sent', notes: 'October' });
    expect(input.lineItems.map((l) => [l.lessonId, l.subtotalCents])).toEqual([
      ['a', 4000],
      ['b', 4000],
      ['c', 4000],
    ]);
  });
});

describe('paidLessonsInvoiceInput', () => {
  it('records the lessons paid, at the rate when the total matches', () => {
    const input = paidLessonsInvoiceInput(
      student,
      { lessons, amountCents: 12000, paidWith: 'venmo-manual' },
      {}
    );

    expect(input).toMatchObject({ status: 'paid', paidWith: 'venmo-manual' });
    expect(input.lineItems.map((l) => l.subtotalCents)).toEqual([4000, 4000, 4000]);
  });

  it('spreads a different total across the lessons, to the cent', () => {
    const input = paidLessonsInvoiceInput(
      student,
      { lessons, amountCents: 10000, paidWith: 'admin-manual' },
      {}
    );

    const parts = input.lineItems.map((l) => l.subtotalCents);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10000);
    expect(input.lineItems.map((l) => l.lessonId)).toEqual(['a', 'b', 'c']);
  });
});

describe('planFillBlock', () => {
  const tuesday: LessonBlock = {
    id: 'block-tue',
    teacherId: 'teacher-1',
    dayOfWeek: 2,
    startMinutes: 9 * 60,
    endMinutes: 20 * 60,
    createdAt: NOW,
    updatedAt: NOW,
  };
  const instructors = [{ id: 'teacher-1', name: 'Test Teacher' }] as Instructor[];
  const like = { teacherId: 'teacher-1', durationMinutes: 30 };

  it('uses a block that already covers the time', () => {
    expect(
      planFillBlock([tuesday], instructors, like, [new Date('2026-10-06T20:00:00Z')])
    ).toEqual({ blockStrategy: { mode: 'existing', blockId: 'block-tue' } });
  });

  it('derives a new block when none covers it, and says so', () => {
    const plan = planFillBlock([tuesday], instructors, like, [
      new Date('2026-10-07T20:00:00Z'), // a Wednesday
    ]);

    expect(plan.blockStrategy).toEqual({ mode: 'create' });
    expect(plan.note).toMatch(/adds a Wednesday .* block for Test Teacher/);
  });

  it('plans nothing for no dates', () => {
    expect(planFillBlock([tuesday], instructors, like, [])).toEqual({});
  });
});
