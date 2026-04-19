/**
 * Recurring series date generation.
 *
 * The client composes the final list of lesson dates up-front, lets Katie
 * uncheck any that collide with holidays in the preview step, and submits
 * the filtered list to `createLessonSeries`. The server writes those dates
 * as-is, so holiday exceptions never exist server-side.
 */

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
 * `start` by the given cadence. Preserves `start`'s time-of-day on each
 * generated date.
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

  const stepDays = cadence === 'biweekly' ? 14 : 7;
  const stepMs = stepDays * 24 * 60 * 60 * 1000;

  const hardMax = 260; // ~5 years of weekly lessons, safety cap
  const softCap = count !== undefined ? Math.max(0, Math.floor(count)) : hardMax;
  const max = Math.min(softCap, hardMax);

  const dates: Date[] = [];
  for (let i = 0; i < max; i++) {
    const next = new Date(start.getTime() + stepMs * i);
    if (end && next.getTime() > end.getTime()) {
      break;
    }
    dates.push(next);
  }

  return dates;
}
