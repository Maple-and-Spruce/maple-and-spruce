/**
 * Calendar-day windows in America/New_York.
 *
 * Shared by the day-of reminders (today) and the under-minimum alert
 * (seven days out). The seven-day case is why the offset is resolved at the
 * TARGET day rather than at `now`: a week can cross a DST change, and using
 * today's offset would shift the window by an hour.
 */
export const TIMEZONE = 'America/New_York';

/**
 * Resolve a timezone's offset (in minutes east of UTC) at a given instant.
 * Uses Intl to handle DST automatically.
 */
export function getTimezoneOffsetMinutes(at: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(at);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  // Hour can be "24" in en-US for midnight; normalize.
  const hour = map['hour'] === '24' ? '00' : map['hour'];
  const tzMs = Date.UTC(
    Number(map['year']),
    Number(map['month']) - 1,
    Number(map['day']),
    Number(hour),
    Number(map['minute']),
    Number(map['second'])
  );
  // (tz wall-clock as if UTC) - (actual UTC) = offset in ms east of UTC.
  return Math.round((tzMs - at.getTime()) / 60_000);
}

/**
 * The UTC instant of 00:00 in the timezone on the given calendar date.
 * `day` may overflow (e.g. 35) — `Date.UTC` rolls it into the next month.
 */
function startOfZonedDay(year: number, month: number, day: number): Date {
  const wallClockAsUtc = Date.UTC(year, month, day, 0, 0, 0, 0);
  // Guess with the offset at wall-clock-as-UTC, then correct with the offset
  // at the guessed instant. Two passes settle on the right side of a DST
  // change, which in ET happens at 02:00, after midnight.
  let start = wallClockAsUtc - getTimezoneOffsetMinutes(new Date(wallClockAsUtc), TIMEZONE) * 60_000;
  start = wallClockAsUtc - getTimezoneOffsetMinutes(new Date(start), TIMEZONE) * 60_000;
  return new Date(start);
}

/**
 * [start, end] of the ET calendar day `offsetDays` after the ET day
 * containing `now`. `end` is 1ms before the next day's midnight, so a 23- or
 * 25-hour DST day is covered exactly.
 */
export function getEtDayWindow(
  now: Date,
  offsetDays = 0
): { start: Date; end: Date } {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now); // "2026-05-06"
  const [y, m, d] = ymd.split('-').map(Number);

  const start = startOfZonedDay(y, m - 1, d + offsetDays);
  const nextStart = startOfZonedDay(y, m - 1, d + offsetDays + 1);
  return { start, end: new Date(nextStart.getTime() - 1) };
}
