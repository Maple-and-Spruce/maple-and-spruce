/**
 * Turning a block of lessons into invoice lines (#113).
 *
 * Katie's end-of-lesson conversation ends one of two ways: the card on file is
 * charged, or the family is sent an invoice. The charge side has had a single
 * pure planner since legacy #864 (`planPrepayment`), so the amount on screen and the
 * amount taken cannot drift. The invoice side had nothing, and had grown three
 * separate descriptions of the same line:
 *
 *  - the invoice builder's lesson picker, which wrote the line at **$0** and
 *    formatted the date in the *machine's* timezone (#106);
 *  - the taught-lesson toast on the student page, which priced it correctly;
 *  - and now the commit card, which needs a whole block at once.
 *
 * One function, so a lesson line reads the same wherever it was raised from and
 * is priced by the same resolver the charge path uses.
 */
import type { Lesson } from './lesson';
import type { InvoiceLineItem } from './invoice';
import { SCHEDULE_TIME_ZONE } from './student-lesson-schedule';

/** The lesson fields a line needs. Narrow, so callers can pass a plan's rows. */
export type InvoiceableLesson = Pick<
  Lesson,
  'id' | 'scheduledAt' | 'durationMinutes'
>;

/**
 * The day a lesson line names, in the **shop** timezone.
 *
 * Always the shop zone, never the machine's: an admin travelling one timezone
 * west would otherwise raise invoices naming the previous day for an evening
 * lesson, and the line is what the family reads.
 */
export function lessonLineDay(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: SCHEDULE_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/** How a lesson reads on an invoice: `30-min lesson on Mon, Oct 5`. */
export function describeLessonLine(lesson: InvoiceableLesson): string {
  return `${lesson.durationMinutes}-min lesson on ${lessonLineDay(
    lesson.scheduledAt
  )}`;
}

/**
 * One line per lesson, priced by the same resolver the card charge uses.
 *
 * `newId` is injected rather than generated here so this stays pure and a test
 * can assert on whole objects; every caller passes `newInvoiceLineId`.
 */
export function lessonInvoiceLines(
  lessons: readonly InvoiceableLesson[],
  rateCentsFor: (lesson: InvoiceableLesson) => number,
  newId: () => string
): InvoiceLineItem[] {
  return lessons.map((lesson) => {
    const unitAmountCents = rateCentsFor(lesson);
    return {
      id: newId(),
      description: describeLessonLine(lesson),
      lessonId: lesson.id,
      quantity: 1,
      unitAmountCents,
      subtotalCents: unitAmountCents,
    };
  });
}

/** What the invoice will total, so the button can say it before it is raised. */
export function lessonInvoiceTotalCents(lines: InvoiceLineItem[]): number {
  return lines.reduce((sum, line) => sum + line.subtotalCents, 0);
}
