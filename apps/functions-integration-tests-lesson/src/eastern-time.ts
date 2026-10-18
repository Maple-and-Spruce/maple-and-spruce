/**
 * The UTC instant of `hour:minute` Eastern on the given calendar day.
 *
 * The offset is read for that day rather than assumed: a fixed EDT (+4) puts
 * every time an hour early once the date crosses the November switch to EST,
 * which is a lesson 3 weeks out from any date after mid-October.
 */
export function easternToUtc(
  year: number,
  month: number,
  date: number,
  hour: number,
  minute = 0
): Date {
  const noon = new Date(Date.UTC(year, month, date, 12));
  const zone =
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      timeZoneName: 'shortOffset',
    })
      .formatToParts(noon)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-5';
  const offsetHours = -Number(zone.replace('GMT', '') || 0);
  // Date.UTC rolls an hour past 24 into the next day, which is correct here.
  return new Date(Date.UTC(year, month, date, hour + offsetHours, minute));
}
