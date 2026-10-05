/**
 * One button: book the next lessons that are not on the calendar yet, then
 * take payment for all of them (#158).
 *
 * Booking comes first because a charge covers lesson ids. If payment fails
 * afterwards the lessons stay booked: they are real teaching the family
 * expects, they show as booked and unpaid, and the button can be pressed
 * again. The message says exactly that.
 *
 * Dependencies are passed in so this can be tested without Firebase.
 */
import {
  SCHEDULE_TIME_ZONE,
  newLessonKey,
  resolvePrivatePayLessonRateCents,
} from '@maple/ts/domain';
import type {
  BlockStrategy,
  CreateInvoiceInput,
  CreateLessonSeriesInput,
  Instructor,
  Lesson,
  LessonBlock,
  LessonRateByLength,
  NextLessonItem,
  Student,
  StudentLessonSchedule,
} from '@maple/ts/domain';
import { blockInvoiceInput, planFillBlock } from '../student-billing';

export type PayMethod = 'card' | 'invoice' | 'none';

export interface BookAndPayDeps {
  createLessonSeries: (
    input: CreateLessonSeriesInput & { blockStrategy?: BlockStrategy }
  ) => Promise<{ lessons: Lesson[] }>;
  /** Resolves to an error message, or null when the charge went through. */
  chargeNow: (input: {
    studentId: string;
    lessonIds: string[];
    amountCents: number;
  }) => Promise<string | null>;
  createInvoice: (input: CreateInvoiceInput) => Promise<unknown>;
}

export interface BookAndPayArgs {
  student: Student;
  schedule: StudentLessonSchedule | undefined;
  items: NextLessonItem[];
  blocks: LessonBlock[];
  instructors: Instructor[];
  rateByLength: LessonRateByLength;
  method: PayMethod;
}

export type BookAndPayResult =
  | { ok: true; notice: string }
  | { ok: false; error: string };

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** "Oct 6, Oct 13 and Oct 20". */
export function formatDateList(dates: Date[]): string {
  const labels = dates.map((d) =>
    d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: SCHEDULE_TIME_ZONE,
    })
  );
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export async function bookAndPay(
  deps: BookAndPayDeps,
  { student, schedule, items, blocks, instructors, rateByLength, method }: BookAndPayArgs
): Promise<BookAndPayResult> {
  if (items.length === 0) return { ok: false, error: 'There are no lessons to book.' };

  const lessons: Array<Pick<Lesson, 'id' | 'scheduledAt' | 'durationMinutes'>> =
    items
      .filter((item) => item.lessonId)
      .map((item) => ({
        id: item.lessonId as string,
        scheduledAt: item.scheduledAt,
        durationMinutes: item.durationMinutes,
      }));
  const toBook = items.filter((item) => !item.lessonId);

  let booked = 0;
  if (toBook.length > 0) {
    if (!schedule) {
      return { ok: false, error: 'Set a weekly time before booking lessons.' };
    }
    const base = {
      studentId: student.id,
      teacherId: schedule.teacherId,
      durationMinutes: schedule.durationMinutes,
      room: schedule.room,
    };
    // Dates on the weekly time fit its block by construction. A moved date
    // may not, so each one gets a block planned for it.
    const onSlot = toBook.filter(
      (item) => item.key === newLessonKey(item.scheduledAt)
    );
    const moved = toBook.filter(
      (item) => item.key !== newLessonKey(item.scheduledAt)
    );
    try {
      if (onSlot.length > 0) {
        const result = await deps.createLessonSeries({
          ...base,
          scheduledAts: onSlot.map((item) => item.scheduledAt),
          blockId: schedule.blockId,
        });
        lessons.push(...result.lessons);
        booked += result.lessons.length;
      }
      for (const item of moved) {
        const plan = planFillBlock(blocks, instructors, schedule, [
          item.scheduledAt,
        ]);
        if (plan.blocked) {
          return {
            ok: false,
            error: booked
              ? `Booked ${booked}, but ${formatDateList([item.scheduledAt])} could not be: ${plan.blocked}`
              : plan.blocked,
          };
        }
        const result = await deps.createLessonSeries({
          ...base,
          scheduledAts: [item.scheduledAt],
          blockStrategy: plan.blockStrategy,
        });
        lessons.push(...result.lessons);
        booked += result.lessons.length;
      }
    } catch (err) {
      const why = errorMessage(err, 'Could not book the lessons');
      return {
        ok: false,
        error: booked ? `Booked ${booked}, then stopped: ${why}` : why,
      };
    }
  }

  lessons.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  const dates = formatDateList(lessons.map((l) => l.scheduledAt));
  const totalCents = lessons.reduce(
    (sum, lesson) =>
      sum + resolvePrivatePayLessonRateCents(lesson, student, rateByLength),
    0
  );
  const bookedPrefix = booked
    ? `Booked ${booked} ${booked === 1 ? 'lesson' : 'lessons'}, but `
    : '';

  if (method === 'none') {
    return { ok: true, notice: `Booked ${dates}.` };
  }

  if (method === 'card') {
    const failure = await deps.chargeNow({
      studentId: student.id,
      lessonIds: lessons.map((l) => l.id),
      amountCents: totalCents,
    });
    if (failure) {
      return {
        ok: false,
        error: `${bookedPrefix}the charge did not go through: ${failure}`,
      };
    }
    return { ok: true, notice: `Charged ${money(totalCents)} for ${dates}.` };
  }

  try {
    await deps.createInvoice(
      blockInvoiceInput(student, { lessons, amountCents: totalCents }, rateByLength)
    );
  } catch (err) {
    return {
      ok: false,
      error: `${bookedPrefix}the invoice was not sent: ${errorMessage(err, 'unknown error')}`,
    };
  }
  return {
    ok: true,
    notice: `Sent an invoice for ${money(totalCents)} for ${dates}.`,
  };
}
