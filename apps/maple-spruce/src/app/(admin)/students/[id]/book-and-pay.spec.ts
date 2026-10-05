import { describe, expect, it, vi } from 'vitest';
import type {
  Instructor,
  Lesson,
  LessonBlock,
  Student,
  StudentLessonSchedule,
} from '@maple/ts/domain';
import { newLessonKey, type NextLessonItem } from '@maple/react/lessons';
import { bookAndPay, formatDateList, type BookAndPayDeps } from './book-and-pay';

const NOW = new Date('2026-10-01T12:00:00Z');

const student: Student = {
  id: 'stu-1',
  name: 'Robin Ashfield',
  instrument: 'violin',
  isAdultStudent: false,
  primaryTeacherId: 'teacher-1',
  isHopeScholarship: false,
  lessonRateCents: 4500,
  status: 'active',
  createdAt: NOW,
  updatedAt: NOW,
};

const schedule: StudentLessonSchedule = {
  id: 'sched-1',
  studentId: 'stu-1',
  teacherId: 'teacher-1',
  blockId: 'block-tue',
  dayOfWeek: 2,
  startMinutes: 16 * 60,
  durationMinutes: 45,
  room: 'spruce',
  startsOn: new Date('2026-09-01T04:00:00Z'),
  status: 'active',
  createdAt: NOW,
  updatedAt: NOW,
};

const blocks: LessonBlock[] = [
  {
    id: 'block-tue',
    teacherId: 'teacher-1',
    dayOfWeek: 2,
    startMinutes: 9 * 60,
    endMinutes: 20 * 60,
    createdAt: NOW,
    updatedAt: NOW,
  },
];
const instructors = [{ id: 'teacher-1', name: 'Teacher' }] as Instructor[];

const slot = (iso: string): NextLessonItem => {
  const at = new Date(iso);
  return { key: newLessonKey(at), scheduledAt: at, durationMinutes: 45 };
};
const booked = (id: string, iso: string): NextLessonItem => ({
  key: id,
  lessonId: id,
  scheduledAt: new Date(iso),
  durationMinutes: 45,
});

function deps(over: Partial<BookAndPayDeps> = {}) {
  let n = 0;
  const createLessonSeries = vi.fn(async (input: { scheduledAts: Date[] }) => ({
    lessons: input.scheduledAts.map(
      (scheduledAt) =>
        ({
          id: `created-${++n}`,
          scheduledAt,
          durationMinutes: 45,
        }) as Lesson
    ),
  }));
  return {
    createLessonSeries,
    chargeNow: vi.fn(async () => null),
    createInvoice: vi.fn(async () => ({})),
    ...over,
  } as BookAndPayDeps & {
    createLessonSeries: typeof createLessonSeries;
    chargeNow: ReturnType<typeof vi.fn>;
    createInvoice: ReturnType<typeof vi.fn>;
  };
}

const args = {
  student,
  schedule,
  blocks,
  instructors,
  rateByLength: {},
};

describe('bookAndPay (#158)', () => {
  it('books the missing dates on the weekly time, then charges for all four', async () => {
    const d = deps();
    const items = [
      booked('lesson-a', '2026-10-06T20:00:00Z'),
      slot('2026-10-13T20:00:00Z'),
      slot('2026-10-20T20:00:00Z'),
      slot('2026-10-27T20:00:00Z'),
    ];

    const result = await bookAndPay(d, { ...args, items, method: 'card' });

    expect(d.createLessonSeries).toHaveBeenCalledTimes(1);
    expect(d.createLessonSeries).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 'stu-1',
        teacherId: 'teacher-1',
        durationMinutes: 45,
        room: 'spruce',
        blockId: 'block-tue',
        scheduledAts: items.slice(1).map((i) => i.scheduledAt),
      })
    );
    expect(d.chargeNow).toHaveBeenCalledWith({
      studentId: 'stu-1',
      lessonIds: ['lesson-a', 'created-1', 'created-2', 'created-3'],
      amountCents: 18000,
    });
    expect(result).toEqual({
      ok: true,
      notice: 'Charged $180.00 for Oct 6, Oct 13, Oct 20 and Oct 27.',
    });
  });

  it('books nothing when all four are already on the calendar', async () => {
    const d = deps();
    const items = [booked('a', '2026-10-06T20:00:00Z')];

    await bookAndPay(d, { ...args, items, method: 'card' });

    expect(d.createLessonSeries).not.toHaveBeenCalled();
    expect(d.chargeNow).toHaveBeenCalledWith(
      expect.objectContaining({ lessonIds: ['a'], amountCents: 4500 })
    );
  });

  it('books a moved date on its own, with a block planned for it', async () => {
    const d = deps();
    const original = new Date('2026-10-13T20:00:00Z');
    const moved: NextLessonItem = {
      key: newLessonKey(original),
      scheduledAt: new Date('2026-10-14T20:00:00Z'), // the Wednesday
      durationMinutes: 45,
    };

    const result = await bookAndPay(d, {
      ...args,
      items: [slot('2026-10-06T20:00:00Z'), moved],
      method: 'card',
    });

    expect(d.createLessonSeries).toHaveBeenCalledTimes(2);
    expect(d.createLessonSeries).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scheduledAts: [moved.scheduledAt],
        blockStrategy: { mode: 'create' },
      })
    );
    expect(result.ok).toBe(true);
  });

  it('keeps the lessons booked when the charge fails, and says so', async () => {
    const d = deps({ chargeNow: vi.fn(async () => 'Card declined') });

    const result = await bookAndPay(d, {
      ...args,
      items: [slot('2026-10-06T20:00:00Z'), slot('2026-10-13T20:00:00Z')],
      method: 'card',
    });

    expect(result).toEqual({
      ok: false,
      error: 'Booked 2 lessons, but the charge did not go through: Card declined',
    });
  });

  it('says only that the charge failed when nothing new was booked', async () => {
    const d = deps({ chargeNow: vi.fn(async () => 'Card declined') });

    const result = await bookAndPay(d, {
      ...args,
      items: [booked('a', '2026-10-06T20:00:00Z')],
      method: 'card',
    });

    expect(result).toEqual({
      ok: false,
      error: 'the charge did not go through: Card declined',
    });
  });

  it('does not charge when booking fails', async () => {
    const d = deps({
      createLessonSeries: vi.fn(async () => {
        throw new Error('The Spruce Room is taken then');
      }),
    });

    const result = await bookAndPay(d, {
      ...args,
      items: [slot('2026-10-06T20:00:00Z')],
      method: 'card',
    });

    expect(result).toEqual({ ok: false, error: 'The Spruce Room is taken then' });
    expect(d.chargeNow).not.toHaveBeenCalled();
  });

  it('sends one invoice, a line per lesson, when there is no card', async () => {
    const d = deps();

    const result = await bookAndPay(d, {
      ...args,
      items: [booked('a', '2026-10-06T20:00:00Z'), slot('2026-10-13T20:00:00Z')],
      method: 'invoice',
    });

    expect(d.chargeNow).not.toHaveBeenCalled();
    const invoice = d.createInvoice.mock.calls[0][0];
    expect(invoice).toMatchObject({ studentId: 'stu-1', status: 'sent' });
    expect(invoice.lineItems.map((l: { lessonId: string }) => l.lessonId)).toEqual([
      'a',
      'created-1',
    ]);
    expect(result).toEqual({
      ok: true,
      notice: 'Sent an invoice for $90.00 for Oct 6 and Oct 13.',
    });
  });

  it('only books for a Hope student', async () => {
    const d = deps();

    const result = await bookAndPay(d, {
      ...args,
      items: [slot('2026-10-06T20:00:00Z')],
      method: 'none',
    });

    expect(d.chargeNow).not.toHaveBeenCalled();
    expect(d.createInvoice).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, notice: 'Booked Oct 6.' });
  });

  it('refuses to book without a weekly time', async () => {
    const d = deps();

    const result = await bookAndPay(d, {
      ...args,
      schedule: undefined,
      items: [slot('2026-10-06T20:00:00Z')],
      method: 'card',
    });

    expect(result.ok).toBe(false);
    expect(d.createLessonSeries).not.toHaveBeenCalled();
  });
});

describe('formatDateList', () => {
  it('joins with "and"', () => {
    expect(
      formatDateList([
        new Date('2026-10-06T20:00:00Z'),
        new Date('2026-10-13T20:00:00Z'),
      ])
    ).toBe('Oct 6 and Oct 13');
    expect(formatDateList([new Date('2026-10-06T20:00:00Z')])).toBe('Oct 6');
  });
});
