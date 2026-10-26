/**
 * Push a lesson and every later one back by a week.
 *
 * Katie is out on a Tuesday, or a family is away. The lessons already on the
 * calendar should slide back a week together, keeping their order and their
 * payments, rather than being moved one at a time into each other's slots
 * (moving the first onto the second is refused, because the room is taken by
 * that student's own lesson).
 *
 * Only lessons still `scheduled` move. A lesson that was taught, missed or
 * cancelled is history and stays where it was.
 *
 * Weeks are added on the studio's wall clock, not as 7 × 24 hours, so a
 * Tuesday noon lesson stays at noon across the change back from daylight time.
 *
 * Pure: the caller checks the room and the blocks, and writes.
 */
import type { Lesson } from './lesson';
import { zonedDateKey, minutesOfDayInZone } from './schedule-format';
import {
  SCHEDULE_TIME_ZONE,
  zonedWallClockToInstant,
} from './student-lesson-schedule';

/** The most weeks one push may move lessons. */
export const MAX_PUSH_WEEKS = 4;

export interface LessonPush<T> {
  lesson: T;
  to: Date;
}

/** The same wall-clock time, `weeks` weeks later, in the studio's timezone. */
export function addWeeksOnWallClock(
  at: Date,
  weeks: number,
  timeZone: string = SCHEDULE_TIME_ZONE
): Date {
  const [year, month, day] = zonedDateKey(at, timeZone).split('-').map(Number);
  // Date.UTC normalizes a day past the end of the month into the next one.
  const shifted = new Date(Date.UTC(year, month - 1, day + weeks * 7));
  return zonedWallClockToInstant(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
    minutesOfDayInZone(at, timeZone),
    timeZone
  );
}

/**
 * Which lessons move, and where to. The anchor and everything of the same
 * student's after it that is still `scheduled`, latest first so a caller that
 * writes one at a time never moves a lesson onto one that has not moved yet.
 */
export function planPushLessonsBack<
  T extends Pick<Lesson, 'id' | 'studentId' | 'scheduledAt' | 'status'>,
>(
  anchor: T,
  lessons: T[],
  weeks = 1,
  timeZone: string = SCHEDULE_TIME_ZONE
): LessonPush<T>[] {
  return lessons
    .filter(
      (lesson) =>
        lesson.studentId === anchor.studentId &&
        lesson.status === 'scheduled' &&
        lesson.scheduledAt.getTime() >= anchor.scheduledAt.getTime()
    )
    .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime())
    .map((lesson) => ({
      lesson,
      to: addWeeksOnWallClock(lesson.scheduledAt, weeks, timeZone),
    }));
}

export function isValidPushWeeks(weeks: unknown): weeks is number {
  return (
    typeof weeks === 'number' &&
    Number.isInteger(weeks) &&
    weeks >= 1 &&
    weeks <= MAX_PUSH_WEEKS
  );
}
