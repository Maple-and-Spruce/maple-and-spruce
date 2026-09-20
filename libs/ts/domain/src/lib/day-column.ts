/**
 * The day column (legacy #838) — Katie's real working view.
 *
 * Her source of truth is a spreadsheet laid out as one day, top to bottom, in
 * time order, with **open slots sitting in the sequence** alongside students:
 *
 *     Pip                   11-12
 *     biweekly open slot    11-12
 *     Tobias                12-1
 *     weekly open slot      1:30-2
 *     Elowen                2-3
 *     biweekly open slot    2-3
 *
 * Two things there that nothing in the portal could express:
 *
 *   1. **An opening belongs in the sequence.** Its position between two named
 *      students is the information — "4-5 is open, right after Delphine" is what
 *      she says to a parent on the phone. `computeOpenings` answers "what could
 *      I offer?" for one teacher; it does not lay out a day.
 *
 *   2. **An opening has a cadence.** "biweekly open slot" is not free time. It
 *      is specifically the alternate week of Pip's hour, and it is sellable to
 *      exactly one biweekly student. An hour holding one biweekly student is
 *      half free; an hour holding two interleaved ones (Marisol and Odette
 *      share Tuesday 5pm) is not free at all, even though it looks identical
 *      from a typical-week view.
 *
 * So occupancy is computed **per week over a repeating cycle** rather than as a
 * single busy/free flag. Cadences are capped at 4 weeks
 * (`MAX_SCHEDULE_INTERVAL_WEEKS`), so every pattern repeats within 12 weeks —
 * the least common multiple of 1, 2, 3 and 4.
 *
 * Parity is decided by asking `scheduleOccurrences` week by week rather than by
 * recomputing it here. Two implementations of "which weeks are this student's"
 * would drift, and the drift would show as a slot the column called free and
 * the materialiser then filled.
 */
import type { LessonBlock } from './lesson-block';
import type { StudentLessonSchedule } from './student-lesson-schedule';
import {
  scheduleOccurrences,
  SCHEDULE_TIME_ZONE,
} from './student-lesson-schedule';
import { zonedDateKey } from './schedule-format';
import { LESSON_DURATIONS_MINUTES } from './openings';

/** LCM of the allowed cadences (1, 2, 3, 4) — every pattern repeats in this. */
export const DAY_COLUMN_CYCLE_WEEKS = 12;

/** Below this an opening is not worth showing as sellable. */
export const MIN_DAY_COLUMN_OPENING_MINUTES = 30;

export interface DayColumnLessonRow {
  kind: 'lesson';
  startMinutes: number;
  endMinutes: number;
  scheduleId: string;
  studentId: string;
  teacherId: string;
  /** 1 = weekly. */
  intervalWeeks: number;
}

export interface DayColumnOpenRow {
  kind: 'open';
  startMinutes: number;
  endMinutes: number;
  /**
   * Free every N weeks. 1 means genuinely every week; 2 is the alternate week
   * of a biweekly student's hour.
   */
  everyWeeks: number;
  /**
   * The free weeks are not evenly spaced — an hour shared by cadences that do
   * not tile cleanly. Rare, and worth saying rather than rounding away.
   */
  irregular: boolean;
  /** Lesson lengths that fit, longest first. */
  fitsDurations: number[];
  /** Blocks this opening sits inside. */
  blockIds: string[];
}

export type DayColumnRow = DayColumnLessonRow | DayColumnOpenRow;

interface FreeSlice {
  startMinutes: number;
  endMinutes: number;
  freeWeeks: number[];
  blockIds: string[];
}

/**
 * The stretches of a day that are free, and on which weeks.
 *
 * Works in elementary intervals — every boundary any block or arrangement
 * introduces — because occupancy changes only at those points. Adjacent
 * intervals free on exactly the same weeks are then merged, so one opening
 * reads as one opening rather than several split at boundaries nobody can see.
 */
function freeSlices(
  dayBlocks: LessonBlock[],
  lessonRows: DayColumnLessonRow[],
  occupancy: { schedule: StudentLessonSchedule; weeks: Set<number> }[],
  cycleLength: number
): FreeSlice[] {
  const bounds = new Set<number>();
  for (const b of dayBlocks) {
    bounds.add(b.startMinutes);
    bounds.add(b.endMinutes);
  }
  for (const r of lessonRows) {
    bounds.add(r.startMinutes);
    bounds.add(r.endMinutes);
  }
  const edges = [...bounds].sort((a, b) => a - b);

  const slices: FreeSlice[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const slice = sliceAt(
      edges[i],
      edges[i + 1],
      dayBlocks,
      occupancy,
      cycleLength
    );
    if (slice) slices.push(slice);
  }

  return mergeAdjacent(slices);
}

/**
 * One elementary interval: is it inside a block, and on which weeks is nobody
 * in it? Returns undefined when the interval is unsellable — outside every
 * block, or taken every week of the cycle.
 */
function sliceAt(
  start: number,
  end: number,
  dayBlocks: LessonBlock[],
  occupancy: { schedule: StudentLessonSchedule; weeks: Set<number> }[],
  cycleLength: number
): FreeSlice | undefined {
  const covering = dayBlocks.filter(
    (b) => b.startMinutes <= start && b.endMinutes >= end
  );
  // Outside every block is not sellable time, so it is not an opening.
  if (covering.length === 0) return undefined;

  const busy = new Set<number>();
  for (const { schedule, weeks } of occupancy) {
    const sStart = schedule.startMinutes;
    const sEnd = schedule.startMinutes + schedule.durationMinutes;
    if (sStart < end && sEnd > start) {
      for (const w of weeks) busy.add(w);
    }
  }

  const freeWeeks = Array.from({ length: cycleLength }, (_, w) => w).filter(
    (w) => !busy.has(w)
  );
  if (freeWeeks.length === 0) return undefined;

  return {
    startMinutes: start,
    endMinutes: end,
    freeWeeks,
    blockIds: covering.map((b) => b.id),
  };
}

/** Merge neighbouring slices free on exactly the same weeks. */
function mergeAdjacent(slices: FreeSlice[]): FreeSlice[] {
  const merged: FreeSlice[] = [];
  for (const slice of slices) {
    const prev = merged[merged.length - 1];
    const sameWeeks =
      prev &&
      prev.endMinutes === slice.startMinutes &&
      prev.freeWeeks.length === slice.freeWeeks.length &&
      prev.freeWeeks.every((w, i) => w === slice.freeWeeks[i]);
    if (sameWeeks) {
      prev.endMinutes = slice.endMinutes;
      prev.blockIds = [...new Set([...prev.blockIds, ...slice.blockIds])];
    } else {
      merged.push({ ...slice });
    }
  }
  return merged;
}

/** The next `count` dates falling on `weekday`, starting from `from`. */
function weekdayDates(from: Date, weekday: number, count: number): Date[] {
  const out: Date[] = [];
  const cursor = new Date(from.getTime());
  for (let i = 0; i < 7 * (count + 1) && out.length < count; i++) {
    const d = new Date(
      Date.UTC(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth(),
        cursor.getUTCDate() + i,
        12
      )
    );
    if (d.getUTCDay() === weekday && d.getTime() >= from.getTime() - 86_400_000) {
      out.push(d);
    }
  }
  return out;
}

/** Evenly spaced free weeks -> the spacing. Otherwise undefined. */
function evenSpacing(weeks: number[], cycle: number): number | undefined {
  if (weeks.length === 0) return undefined;
  if (weeks.length === cycle) return 1;
  const gaps = new Set<number>();
  for (let i = 0; i < weeks.length; i++) {
    const next = weeks[(i + 1) % weeks.length];
    gaps.add((next - weeks[i] + cycle) % cycle);
  }
  return gaps.size === 1 ? [...gaps][0] : undefined;
}

/**
 * Lay out one weekday: every standing lesson in time order, with the openings
 * between and *within* them.
 *
 * `blocks` and `schedules` may cover any weekday and teacher; both are filtered
 * here. Pass a `teacherId` to scope the column to one teacher's day.
 */
export function buildDayColumn(
  weekday: number,
  blocks: LessonBlock[],
  schedules: StudentLessonSchedule[],
  options: {
    teacherId?: string;
    /** Reference point for deciding which weeks are whose. Defaults to now. */
    from?: Date;
    minOpeningMinutes?: number;
    timeZone?: string;
  } = {}
): DayColumnRow[] {
  const {
    teacherId,
    from = new Date(),
    minOpeningMinutes = MIN_DAY_COLUMN_OPENING_MINUTES,
    timeZone = SCHEDULE_TIME_ZONE,
  } = options;

  const dayBlocks = blocks.filter(
    (b) =>
      b.dayOfWeek === weekday &&
      !b.onDate && // a one-off block is not part of a typical week (legacy #835)
      (!teacherId || b.teacherId === teacherId)
  );

  const daySchedules = schedules.filter(
    (s) =>
      s.dayOfWeek === weekday &&
      s.status === 'active' &&
      (!teacherId || s.teacherId === teacherId)
  );

  const cycle = weekdayDates(from, weekday, DAY_COLUMN_CYCLE_WEEKS);

  // Which weeks of the cycle each arrangement occupies. Asked of
  // scheduleOccurrences rather than recomputed, so the column and the
  // materialiser can never disagree about whose week it is.
  //
  // Matched on the shop-zone DATE, not on the instant: an occurrence sits at
  // the lesson's wall-clock time, which is hours away from the probe date and
  // may even fall on the adjacent UTC day.
  const cycleKeys = cycle.map((d) => zonedDateKey(d, timeZone));
  const spanStart = new Date(cycle[0].getTime() - 2 * 86_400_000);
  const spanEnd = new Date(
    cycle[cycle.length - 1].getTime() + 2 * 86_400_000
  );

  const occupancy = daySchedules.map((schedule) => {
    const hit = new Set(
      scheduleOccurrences(schedule, spanStart, spanEnd, timeZone).map((o) =>
        zonedDateKey(o, timeZone)
      )
    );
    return {
      schedule,
      weeks: new Set(
        cycleKeys.map((k, i) => (hit.has(k) ? i : -1)).filter((i) => i >= 0)
      ),
    };
  });

  const lessonRows: DayColumnLessonRow[] = daySchedules.map((s) => ({
    kind: 'lesson',
    startMinutes: s.startMinutes,
    endMinutes: s.startMinutes + s.durationMinutes,
    scheduleId: s.id,
    studentId: s.studentId,
    teacherId: s.teacherId,
    intervalWeeks: s.intervalWeeks ?? 1,
  }));

  const merged = freeSlices(dayBlocks, lessonRows, occupancy, cycle.length);

  const openRows: DayColumnOpenRow[] = merged
    .filter((s) => s.endMinutes - s.startMinutes >= minOpeningMinutes)
    .map((s) => {
      const spacing = evenSpacing(s.freeWeeks, cycle.length);
      return {
        kind: 'open' as const,
        startMinutes: s.startMinutes,
        endMinutes: s.endMinutes,
        everyWeeks: spacing ?? 1,
        irregular: spacing === undefined,
        fitsDurations: LESSON_DURATIONS_MINUTES.filter(
          (d) => d <= s.endMinutes - s.startMinutes
        ),
        blockIds: s.blockIds,
      };
    });

  // Time order, and an opening that starts with a lesson sorts after it —
  // the lesson is the commitment, the opening is what is left of the hour.
  const kindRank = (row: DayColumnRow) => (row.kind === 'lesson' ? 0 : 1);

  return [...lessonRows, ...openRows].sort(
    (a, b) =>
      a.startMinutes - b.startMinutes ||
      kindRank(a) - kindRank(b) ||
      a.endMinutes - b.endMinutes
  );
}
