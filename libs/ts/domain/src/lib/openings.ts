/**
 * Open-slot ("openings") math for the teacher availability finder (#683 / #687).
 *
 * A teacher's LessonBlocks ARE the availability model: each block is a weekly
 * window (weekday + [startMinutes, endMinutes) in the shop timezone) that
 * lessons must fall inside. An *opening* is the part of a block not already
 * taken by the teacher's recurring lessons — the empty space in the block,
 * kept only when it's at least one bookable lesson long.
 *
 * Pure and presentation-agnostic: callers supply the blocks and the occupied
 * weekly intervals (their lessons projected onto a generic week — weekday +
 * minutes-from-midnight), and this returns the free intervals. Because blocks
 * are recurring weekly constraints, a returned opening is by definition
 * offerable as a *standing* weekly slot.
 */
import type { LessonBlock } from './lesson-block';

/** Bookable lesson lengths, longest first — used to label what fits a gap. */
export const LESSON_DURATIONS_MINUTES = [60, 45, 30] as const;

/** The shortest bookable lesson; a free gap smaller than this isn't an opening. */
export const MIN_OPENING_MINUTES = 30;

/** A weekly occupied interval, projected onto a generic Sun–Sat week. */
export interface OccupiedInterval {
  /** Weekday 0 (Sun) – 6 (Sat), shop timezone. */
  weekday: number;
  /** Minutes from midnight, shop timezone. */
  startMinutes: number;
  endMinutes: number;
}

/** A contiguous free interval inside one block. */
export interface Opening {
  /** The block this opening sits in. */
  blockId: string;
  /** Weekday 0 (Sun) – 6 (Sat), shop timezone. */
  weekday: number;
  /** Free-interval start — minutes from midnight, shop timezone. */
  startMinutes: number;
  /** Free-interval end — minutes from midnight, shop timezone. */
  endMinutes: number;
  /**
   * Bookable lesson lengths that fit this interval (subset of
   * LESSON_DURATIONS_MINUTES), longest first. A 45-minute gap fits [45, 30].
   */
  fitsDurations: number[];
}

interface Interval {
  startMinutes: number;
  endMinutes: number;
}

/** Merge overlapping / touching [start,end) intervals; input need not be sorted. */
function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals]
    .filter((i) => i.endMinutes > i.startMinutes)
    .sort((a, b) => a.startMinutes - b.startMinutes);
  const merged: Interval[] = [];
  for (const iv of sorted) {
    const last = merged[merged.length - 1];
    if (last && iv.startMinutes <= last.endMinutes) {
      last.endMinutes = Math.max(last.endMinutes, iv.endMinutes);
    } else {
      merged.push({ ...iv });
    }
  }
  return merged;
}

/**
 * Compute the open (unbooked) intervals inside each block.
 *
 * For each block: take the occupied intervals on the block's weekday, clamp
 * them to the block window, merge them, then walk the window emitting the gaps
 * that are at least `minOpeningMinutes` long. Each gap is labeled with the
 * lesson durations that fit it. Occupied intervals on another weekday or fully
 * outside the window are ignored. Result is sorted by weekday, then start.
 */
export function computeOpenings(
  blocks: Pick<
    LessonBlock,
    'id' | 'dayOfWeek' | 'startMinutes' | 'endMinutes'
  >[],
  occupied: OccupiedInterval[],
  minOpeningMinutes: number = MIN_OPENING_MINUTES,
): Opening[] {
  const openings: Opening[] = [];

  for (const block of blocks) {
    // Occupied intervals on this weekday, clamped to the block window.
    const clamped: Interval[] = occupied
      .filter((o) => o.weekday === block.dayOfWeek)
      .map((o) => ({
        startMinutes: Math.max(o.startMinutes, block.startMinutes),
        endMinutes: Math.min(o.endMinutes, block.endMinutes),
      }))
      .filter((o) => o.endMinutes > o.startMinutes);

    const busy = mergeIntervals(clamped);

    const emit = (start: number, end: number) => {
      if (end - start < minOpeningMinutes) return;
      openings.push({
        blockId: block.id,
        weekday: block.dayOfWeek,
        startMinutes: start,
        endMinutes: end,
        fitsDurations: LESSON_DURATIONS_MINUTES.filter((d) => d <= end - start),
      });
    };

    // Walk the window, emitting the gaps between busy intervals.
    let cursor = block.startMinutes;
    for (const b of busy) {
      emit(cursor, b.startMinutes);
      cursor = Math.max(cursor, b.endMinutes);
    }
    emit(cursor, block.endMinutes);
  }

  openings.sort(
    (a, b) => a.weekday - b.weekday || a.startMinutes - b.startMinutes,
  );
  return openings;
}
