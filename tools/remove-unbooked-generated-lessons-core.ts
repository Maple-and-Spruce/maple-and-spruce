/**
 * Which generated lessons to remove now that lessons are booked, not generated
 * (#157). Pure, so the rule is tested apart from the Firestore runner.
 *
 * A lesson is removed only when every one of these holds:
 *  - **generated**: its id is `sched-…`, so the materialiser made it. A lesson
 *    someone booked by hand is never touched.
 *  - **still `scheduled`**: not cancelled, marked or otherwise acted on.
 *  - **far out**: at least `minWeeksOut` weeks from now. The lessons nearer
 *    than that are the ones families expect, and Katie decides about them.
 *  - **unpaid and unasked**: no charge covers it and no live invoice names it.
 *    Paid-for teaching stays on the calendar, wherever it falls.
 */

export interface CleanupLesson {
  id: string;
  status: string;
  scheduledAt: Date;
}

export const GENERATED_LESSON_PREFIX = 'sched-';
export const DEFAULT_MIN_WEEKS_OUT = 4;

export function lessonsToRemove<T extends CleanupLesson>(
  lessons: T[],
  /** Lessons covered by a charge or named on a live invoice. */
  billed: ReadonlySet<string>,
  now: Date,
  minWeeksOut: number = DEFAULT_MIN_WEEKS_OUT
): T[] {
  const cutoff = now.getTime() + minWeeksOut * 7 * 86_400_000;
  return lessons
    .filter(
      (lesson) =>
        lesson.id.startsWith(GENERATED_LESSON_PREFIX) &&
        lesson.status === 'scheduled' &&
        lesson.scheduledAt.getTime() >= cutoff &&
        !billed.has(lesson.id)
    )
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}
