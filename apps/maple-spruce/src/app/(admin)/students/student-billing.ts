/**
 * Pure helpers behind the student page: lesson lengths, invoice inputs and
 * block planning. Kept out of the .tsx files so they can be unit tested on
 * their own.
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
  newInvoiceLineId,
  resolvePrivatePayLessonRateCents,
} from '@maple/ts/domain';

/** The lessons a block invoice is for, and what it comes to. */
export interface BlockInvoiceLessons {
  lessons: Array<Pick<Lesson, 'id' | 'scheduledAt' | 'durationMinutes'>>;
  amountCents: number;
  note?: string;
}

/** What a standing-schedule dialog submits. */
export interface StandingScheduleSubmit {
  teacherId: string;
  blockId: string;
  dayOfWeek: number;
  startMinutes: number;
  durationMinutes: number;
  intervalWeeks: number;
  startsOn: Date;
  /** How to make room when no block covers the time (legacy #835). */
  blockStrategy?: BlockStrategy;
}

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
  { lessons, note }: BlockInvoiceLessons,
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
