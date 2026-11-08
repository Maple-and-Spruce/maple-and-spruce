/**
 * Recurring series date generation.
 *
 * The client composes the final list of lesson dates up-front, lets Katie
 * uncheck any that collide with holidays in the preview step, and submits
 * the filtered list to `createLessonSeries`. The server writes those dates
 * as-is, so holiday exceptions never exist server-side.
 */

import { addWeeksOnWallClock } from '@maple/ts/domain';

export type SeriesCadence = 'weekly' | 'biweekly';

export interface GenerateWeeklyDatesArgs {
  start: Date;
  cadence: SeriesCadence;
  /**
   * Either provide `count` (number of sessions) or `end` (inclusive end
   * date). If both are provided, whichever produces fewer dates wins.
   */
  count?: number;
  end?: Date;
}

/**
 * Generate an ordered list of session start times stepping forward from
 * `start` by the given cadence. Keeps `start`'s wall-clock time in the
 * studio's timezone, so a 4:00 PM series stays at 4:00 PM across a clock
 * change (stepping by 7 * 24h moved it to 3:00 PM after the fall-back).
 */
export function generateWeeklyDates({
  start,
  cadence,
  count,
  end,
}: GenerateWeeklyDatesArgs): Date[] {
  if (!(start instanceof Date) || !Number.isFinite(start.getTime())) {
    return [];
  }

  const stepWeeks = cadence === 'biweekly' ? 2 : 1;

  const hardMax = 260; // ~5 years of weekly lessons, safety cap
  const softCap = count !== undefined ? Math.max(0, Math.floor(count)) : hardMax;
  const max = Math.min(softCap, hardMax);

  const dates: Date[] = [];
  for (let i = 0; i < max; i++) {
    const next = addWeeksOnWallClock(start, stepWeeks * i);
    if (end && next.getTime() > end.getTime()) {
      break;
    }
    dates.push(next);
  }

  return dates;
}
