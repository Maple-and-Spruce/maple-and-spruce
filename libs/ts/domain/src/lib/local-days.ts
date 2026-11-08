/**
 * Calendar-day arithmetic in the viewer's own timezone.
 *
 * Adding `n * 24h` to a local midnight is wrong on the two days a year the
 * clocks change. On the November fall-back Sunday the day is 25 hours long, so
 * midnight + 24h is 11 PM the *same* day: My Week labelled Monday "11/1" and
 * every day after it one day behind. Step by the calendar date instead, and let
 * the Date constructor resolve the wall-clock time.
 */
export function addLocalDays(date: Date, days: number): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  );
}

/** Local Sunday 00:00 of the week containing `date`. */
export function startOfLocalWeek(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - date.getDay(),
  );
}
