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
import {
  minutesOfDayInZone,
  weekdayIndexInZone,
  zonedDateKey,
} from './schedule-format';

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
  /**
   * `YYYY-MM-DD` (shop timezone) when this block applies to **one date only**.
   *
   * Absent — the normal case — means a recurring weekly window, unchanged from
   * #686. Present means a one-off: a block derived from a single lesson that
   * has no standing arrangement behind it (#835).
   *
   * The distinction is load-bearing, not cosmetic. A block is what `get-my-week`
   * reads as a teacher's *standing availability*, so deriving a recurring block
   * from a one-off makeup lesson would claim the teacher works that slot every
   * week. `dayOfWeek` is still set (derived from this date) so weekday queries
   * and UI keep working without special-casing.
   */
  onDate?: string;
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
  block: Pick<
    LessonBlock,
    'dayOfWeek' | 'startMinutes' | 'endMinutes' | 'onDate'
  >,
  timeZone: string = DEFAULT_LESSON_TIME_ZONE
): boolean {
  if (Number.isNaN(scheduledAt.getTime())) return false;
  // A one-off block covers its own date and nothing else — matching the
  // weekday is not enough, or next week's lesson would inherit it.
  if (block.onDate && zonedDateKey(scheduledAt, timeZone) !== block.onDate) {
    return false;
  }
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

// ---------------------------------------------------------------------------
// Deriving a block from what is being scheduled (#835)
// ---------------------------------------------------------------------------

/**
 * Is this block standing weekly availability, rather than a one-off?
 *
 * The one definition of that question. Reads of a teacher's *typical week*
 * filter on this; fit and attribution checks must not, or a lesson correctly
 * attributed to a one-off block would come back flagged as needing one.
 */
export function isRecurringBlock(block: Pick<LessonBlock, 'onDate'>): boolean {
  return !block.onDate;
}

/** How far from a block a lesson may sit and still be an extend candidate. */
export const BLOCK_EXTEND_WINDOW_MINUTES = 60;

/** The slot a lesson (or a standing arrangement's occurrence) wants to occupy. */
export interface BlockTarget {
  teacherId: string;
  /** The lesson's start. For an arrangement, any one occurrence. */
  scheduledAt: Date;
  durationMinutes: number;
  /**
   * Does this repeat weekly?
   *
   * This is what decides whether a derived block may claim standing
   * availability. A standing arrangement genuinely is weekly availability; a
   * single makeup lesson is not.
   */
  recurring: boolean;
}

/** A block that could be widened to fit the target. */
export interface BlockExtension {
  block: LessonBlock;
  /** The window the block would become. */
  startMinutes: number;
  endMinutes: number;
  /** How much wider that makes it. */
  addedMinutes: number;
  /** Distance from the lesson to the block's nearest edge; 0 when they overlap. */
  gapMinutes: number;
}

/** The block that would be created if nothing suitable exists. */
export interface BlockDraft {
  teacherId: string;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  /** Set for a one-off block; absent means recurring weekly. */
  onDate?: string;
}

/**
 * What the caller decided to do about the block. The server never picks for
 * them: widening a recurring block changes every future week on that weekday,
 * which has to be a choice someone made on purpose.
 */
export type BlockStrategy =
  /** Use a block that already exists and already fits. */
  | { mode: 'existing'; blockId: string }
  /** Derive a new block from what is being scheduled. */
  | { mode: 'create' }
  /**
   * Widen a nearby block. `weekly` changes the recurring window for good;
   * `this-date` lays a one-off block over it and leaves the week alone.
   */
  | { mode: 'extend'; blockId: string; scope: 'this-date' | 'weekly' };

export interface BlockPlan {
  /** A block that already covers the slot — there is nothing to decide. */
  fits?: LessonBlock;
  /** Widenable blocks within the window, smallest extension first. */
  extensions: BlockExtension[];
  /** What creating a fresh block would produce. Absent when impossible. */
  draft?: BlockDraft;
  /** Why no block can represent this slot at all. */
  blocked?: string;
}

/**
 * Work out how a lesson can get a block: one already fits, one can be widened,
 * or a new one is derived from the lesson itself.
 *
 * Pure, and deliberately shared: the dialog calls it to word the buttons and
 * the server calls it again to check the choice it was handed. Two
 * implementations would drift, and the drift would show up as a lesson the UI
 * offered to schedule and the server then refused.
 *
 * It never decides anything. Widening a recurring block changes every future
 * week for that weekday, which is Katie's call to make, not a default to apply
 * quietly.
 */
export function planBlockAttribution(
  blocks: LessonBlock[],
  target: BlockTarget,
  timeZone: string = DEFAULT_LESSON_TIME_ZONE
): BlockPlan {
  const { teacherId, scheduledAt, durationMinutes, recurring } = target;

  if (Number.isNaN(scheduledAt.getTime())) {
    return { extensions: [], blocked: 'That is not a valid date and time.' };
  }

  const dayOfWeek = weekdayIndexInZone(scheduledAt, timeZone);
  const onDate = zonedDateKey(scheduledAt, timeZone);
  const start = minutesOfDayInZone(scheduledAt, timeZone);
  const end = start + durationMinutes;

  // A block is a window within a single day, so a lesson running past midnight
  // cannot be expressed as one at all. Say so rather than writing a block whose
  // end is greater than the day is long — nothing would ever fit it again.
  if (end > MINUTES_PER_DAY) {
    return {
      extensions: [],
      blocked:
        'This lesson runs past midnight, which no block can cover. Split it or move it earlier.',
    };
  }

  // Only blocks that can host this target: same teacher, same weekday, and —
  // for a recurring arrangement — recurring themselves, since a one-off block
  // would leave every week after the first unattributed.
  const eligible = blocks.filter((b) => {
    if (b.teacherId !== teacherId) return false;
    if (b.dayOfWeek !== dayOfWeek) return false;
    if (!b.onDate) return true;
    return !recurring && b.onDate === onDate;
  });

  const fits = eligible.find((b) =>
    lessonFitsBlock(scheduledAt, durationMinutes, b, timeZone)
  );
  if (fits) return { fits, extensions: [] };

  const draft: BlockDraft = {
    teacherId,
    dayOfWeek,
    startMinutes: start,
    endMinutes: end,
    ...(recurring ? {} : { onDate }),
  };

  const extensions = eligible
    .map((block) => {
      // Distance to the nearest edge. Overlapping counts as adjacent (0) —
      // a 60-minute lesson in a 30-minute window is the commonest case here.
      const gapMinutes = Math.max(
        0,
        block.startMinutes - end,
        start - block.endMinutes
      );
      const startMinutes = Math.min(block.startMinutes, start);
      const endMinutes = Math.max(block.endMinutes, end);
      return {
        block,
        startMinutes,
        endMinutes,
        addedMinutes:
          endMinutes - startMinutes - (block.endMinutes - block.startMinutes),
        gapMinutes,
      };
    })
    .filter((e) => e.gapMinutes <= BLOCK_EXTEND_WINDOW_MINUTES)
    // Smallest widening first: the least claim about availability that still
    // fits the lesson. Ties break on the closer block.
    .sort(
      (a, b) => a.addedMinutes - b.addedMinutes || a.gapMinutes - b.gapMinutes
    );

  return { extensions, draft };
}
