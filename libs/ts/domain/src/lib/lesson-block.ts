/**
 * Lesson block domain types (#683 / #686).
 *
 * A LessonBlock is a single **weekly constraint object**, created by an admin
 * (Katie) and attributed to one teacher. It does NOT reserve a room and has NO
 * per-week instances — one object defines a recurring weekly window that the
 * teacher's lessons must fall inside. Blocks are the container that lessons are
 * attributed to (`lesson.blockId`), so lessons can't be dropped at arbitrary
 * times.
 *
 * Times are wall-clock minutes-from-midnight in the shop timezone
 * (America/New_York). The weekday/time-fit check interprets a lesson's instant
 * in that zone — a 5pm-ET lesson stored in UTC must map to the ET weekday/clock
 * regardless of server timezone or DST.
 */
import type { Lesson } from './lesson';
import { minutesOfDayInZone, weekdayIndexInZone } from './schedule-format';

/** Shop timezone — the zone block windows and lesson-fit are evaluated in. */
export const DEFAULT_LESSON_TIME_ZONE = 'America/New_York';

/** Minutes in a day; block windows live in [0, 1440]. */
export const MINUTES_PER_DAY = 1440;

export interface LessonBlock {
  id: string;
  /** Instructor this block is attributed to. */
  teacherId: string;
  /** Weekday the block recurs on: 0 (Sun) – 6 (Sat), in the shop timezone. */
  dayOfWeek: number;
  /** Window start — minutes from midnight, shop timezone. */
  startMinutes: number;
  /** Window end — minutes from midnight, shop timezone (exclusive upper bound for fit). */
  endMinutes: number;
  /** Optional human label, e.g. "Tuesday afternoons". */
  label?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateLessonBlockInput = Omit<
  LessonBlock,
  'id' | 'createdAt' | 'updatedAt'
>;

/** A block's teacher can't be reassigned — delete + recreate instead. */
export type UpdateLessonBlockInput = Partial<
  Omit<LessonBlock, 'id' | 'teacherId' | 'createdAt' | 'updatedAt'>
> & { id: string };

/**
 * Does a lesson fall on the block's weekday and sit fully inside its window?
 * Evaluated in the shop timezone (default America/New_York). Duration is added
 * to the in-zone start minute; a lesson must both start at/after the block
 * start and end at/before the block end.
 */
export function lessonFitsBlock(
  scheduledAt: Date,
  durationMinutes: number,
  block: Pick<LessonBlock, 'dayOfWeek' | 'startMinutes' | 'endMinutes'>,
  timeZone: string = DEFAULT_LESSON_TIME_ZONE
): boolean {
  if (Number.isNaN(scheduledAt.getTime())) return false;
  if (weekdayIndexInZone(scheduledAt, timeZone) !== block.dayOfWeek) {
    return false;
  }
  const start = minutesOfDayInZone(scheduledAt, timeZone);
  const end = start + durationMinutes;
  return start >= block.startMinutes && end <= block.endMinutes;
}

/**
 * Is a lesson "unattributed" — i.e. needs a block? True when it has no
 * `blockId`, or its block no longer exists / belongs to another teacher / no
 * longer covers the lesson's weekday+time. Powers the UI flag Katie uses to
 * migrate grandfathered (pre-block) lessons.
 */
export function isLessonUnattributed(
  lesson: Pick<
    Lesson,
    'blockId' | 'teacherId' | 'scheduledAt' | 'durationMinutes'
  >,
  blocks: LessonBlock[],
  timeZone: string = DEFAULT_LESSON_TIME_ZONE
): boolean {
  if (!lesson.blockId) return true;
  const block = blocks.find((b) => b.id === lesson.blockId);
  if (!block) return true;
  if (block.teacherId !== lesson.teacherId) return true;
  return !lessonFitsBlock(
    lesson.scheduledAt,
    lesson.durationMinutes,
    block,
    timeZone
  );
}
