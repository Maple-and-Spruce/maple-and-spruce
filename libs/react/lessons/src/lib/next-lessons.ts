/**
 * "The next 4" as the Next lessons tab shows them (#158).
 *
 * `planNextLessons` says which lessons are already booked and unpaid and which
 * weekly-time dates would make up the four. This adds what Katie does to that
 * proposal before paying: skipping a week (the family is away) and moving a
 * date. Both are local until she pays, so nothing is written for a proposal
 * she abandons.
 *
 * A skipped week is replaced by the next one, so "the next 4" stays four.
 */
import {
  DEFAULT_PREPAY_LESSON_COUNT,
  lessonBillingState,
  planNextLessons,
} from '@maple/ts/domain';
import type {
  Invoice,
  Lesson,
  LessonScheduledCharge,
  StudentLessonSchedule,
} from '@maple/ts/domain';

export interface NextLessonItem {
  /** Stable across re-plans: the lesson id, or `new-<iso>` for a date to book. */
  key: string;
  scheduledAt: Date;
  durationMinutes: number;
  /** Set when the lesson is already on the calendar. */
  lessonId?: string;
}

export interface NextLessonsView {
  items: NextLessonItem[];
  /** No active weekly time, so nothing beyond booked lessons can be proposed. */
  noSlot: boolean;
}

export function newLessonKey(at: Date): string {
  return `new-${at.toISOString()}`;
}

export function buildNextLessons({
  schedule,
  lessons,
  charges,
  invoicedIds,
  now,
  skipped = new Set(),
  moved = new Map(),
  count = DEFAULT_PREPAY_LESSON_COUNT,
}: {
  schedule: StudentLessonSchedule | undefined;
  lessons: Lesson[];
  charges: LessonScheduledCharge[];
  invoicedIds: ReadonlySet<string>;
  now: Date;
  /** Keys Katie skipped for this batch. */
  skipped?: ReadonlySet<string>;
  /** New dates Katie moved, by their original key. */
  moved?: ReadonlyMap<string, Date>;
  count?: number;
}): NextLessonsView {
  // Ask for enough that every skip is replaced by the following week.
  const plan = planNextLessons(
    schedule,
    lessons,
    charges,
    now,
    invoicedIds,
    count + skipped.size
  );
  const duration = schedule?.durationMinutes;

  const booked: NextLessonItem[] = plan.booked.map((lesson) => ({
    key: lesson.id,
    scheduledAt: lesson.scheduledAt,
    durationMinutes: lesson.durationMinutes,
    lessonId: lesson.id,
  }));
  const toBook: NextLessonItem[] = plan.toBook.map((at) => {
    const key = newLessonKey(at);
    return {
      key,
      scheduledAt: moved.get(key) ?? at,
      durationMinutes: duration ?? 30,
    };
  });

  const items = [...booked, ...toBook]
    .filter((item) => !skipped.has(item.key))
    .slice(0, count)
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  return { items, noSlot: plan.noSlot };
}

/**
 * Has this lesson been paid for? A paid card charge, or a paid invoice line.
 *
 * Deliberately narrower than "billed": a sent invoice is an ask, not money.
 */
export function isLessonPaid(
  lessonId: string,
  charges: LessonScheduledCharge[],
  invoices: Invoice[]
): boolean {
  const state = lessonBillingState(lessonId, charges, invoices);
  return (
    state.kind === 'charge-paid' ||
    (state.kind === 'invoiced' && state.status === 'paid')
  );
}

/** The last upcoming lesson already paid for, if any — "paid through". */
export function paidThrough(
  lessons: Lesson[],
  charges: LessonScheduledCharge[],
  invoices: Invoice[],
  now: Date
): Date | undefined {
  let latest: Date | undefined;
  for (const lesson of lessons) {
    if (lesson.status === 'cancelled') continue;
    if (lesson.scheduledAt.getTime() < now.getTime()) continue;
    if (!isLessonPaid(lesson.id, charges, invoices)) continue;
    if (!latest || lesson.scheduledAt > latest) latest = lesson.scheduledAt;
  }
  return latest;
}
