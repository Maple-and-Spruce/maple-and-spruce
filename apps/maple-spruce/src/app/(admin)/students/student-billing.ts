/**
 * Pure helpers behind the student launchers and the student page: lesson
 * lengths, invoice inputs and block planning. Kept out of the .tsx files so
 * they can be unit tested on their own.
 */
import type {
  BlockStrategy,
  CreateInvoiceInput,
  Instructor,
  Lesson,
  LessonBlock,
  LessonRateByLength,
  Student,
} from '@maple/ts/domain';
import {
  WEEKDAY_LONG,
  lessonInvoiceLines,
  planBlockAttribution,
  splitCentsEvenly,
  resolvePrivatePayLessonRateCents,
} from '@maple/ts/domain';
import type {
  CommitLessonsInvoiceInput,
  CommitLessonsRecordPaidInput,
} from '@maple/react/lessons';
import { newInvoiceLineId } from '@maple/react/invoices';

/** Duration default from a student's registered lesson length. */
export function defaultDurationFor(student: Student): 30 | 45 | 60 {
  if (student.registeredLessonLength === '45-min') return 45;
  if (student.registeredLessonLength === '60-min') return 60;
  return 30;
}

/**
 * The invoice for a block of lessons, one line per lesson, sent straight away.
 *
 * Every line carries `lessonId`, which is what stops the same teaching also
 * being charged to a card, here or by the nightly job (#101).
 */
export function blockInvoiceInput(
  student: Student,
  { lessons, note }: CommitLessonsInvoiceInput,
  rateByLength: LessonRateByLength,
): CreateInvoiceInput {
  return {
    studentId: student.id,
    status: 'sent',
    notes: note,
    lineItems: lessonInvoiceLines(
      lessons,
      (lesson) =>
        resolvePrivatePayLessonRateCents(lesson, student, rateByLength),
      newInvoiceLineId,
    ),
  };
}

/** "5:00 PM" from minutes past midnight. */
function clockLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * Which teaching block lessons filled in from `like` go in.
 *
 * Every lesson needs a block, and lessons made by hand before blocks mattered
 * often have none, so copying `like.blockId` is not enough. A recurring block
 * that already fits is used quietly. Otherwise a new one is derived from the
 * lessons themselves, and the note says so, because a block is standing
 * availability Katie should know she now has. Widening an existing block is
 * never done from here: it changes every future week on that weekday, which is
 * the scheduling form's question to ask, not a one-click default.
 */
export function planFillBlock(
  blocks: LessonBlock[],
  instructors: Instructor[],
  like: Pick<Lesson, 'teacherId' | 'durationMinutes'>,
  scheduledAts: Date[]
): { blockStrategy?: BlockStrategy; note?: string; blocked?: string } {
  if (scheduledAts.length === 0) return {};
  const plan = planBlockAttribution(blocks, {
    teacherId: like.teacherId,
    scheduledAt: scheduledAts[0],
    durationMinutes: like.durationMinutes,
    recurring: true,
  });
  if (plan.fits) {
    return { blockStrategy: { mode: 'existing', blockId: plan.fits.id } };
  }
  if (plan.draft) {
    const teacher =
      instructors.find((i) => i.id === like.teacherId)?.name ?? 'this teacher';
    return {
      blockStrategy: { mode: 'create' },
      note:
        `No teaching block covers that time, so this also adds a ` +
        `${WEEKDAY_LONG[plan.draft.dayOfWeek]} ` +
        `${clockLabel(plan.draft.startMinutes)} to ` +
        `${clockLabel(plan.draft.endMinutes)} block for ${teacher}.`,
    };
  }
  return {
    blocked:
      plan.blocked ??
      'No teaching block can cover these times. Use Other dates to pick different ones.',
  };
}

/**
 * The record of lessons the family already paid for outside Square: the same
 * lines as a block invoice, created paid. It never reaches Square, so nobody
 * is emailed a bill, and its lines stop the lessons being charged later.
 */
export function paidLessonsInvoiceInput(
  student: Student,
  input: CommitLessonsRecordPaidInput,
  rateByLength: LessonRateByLength
): CreateInvoiceInput {
  const atRate = blockInvoiceInput(student, input, rateByLength);
  const rateTotal = atRate.lineItems.reduce((sum, l) => sum + l.subtotalCents, 0);
  // Recorded at the rate unless Katie typed what was actually paid (often the
  // case for history); then that total is split across the lessons, so the
  // record matches the money that changed hands.
  const lineItems =
    input.amountCents === rateTotal
      ? atRate.lineItems
      : (() => {
          const parts = splitCentsEvenly(input.amountCents, input.lessons.length);
          const byId = new Map(input.lessons.map((l, i) => [l.id, parts[i]]));
          return lessonInvoiceLines(
            input.lessons,
            (lesson) => byId.get(lesson.id) ?? 0,
            newInvoiceLineId
          );
        })();
  return {
    ...atRate,
    lineItems,
    status: 'paid',
    paidWith: input.paidWith,
  };
}
