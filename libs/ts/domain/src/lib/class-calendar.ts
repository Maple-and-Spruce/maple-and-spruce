/**
 * Calendar entries for a class registration: the .ics attached to the
 * confirmation email and offered on the confirmation page, plus pre-filled
 * Google / Outlook / Microsoft 365 links.
 *
 * Pure and dependency-free so the Webflow widget and the Cloud Functions can
 * share it. (`@maple/ts/calendar` builds the subscription feeds, but it pulls
 * in ical-generator, which neither of these needs.)
 */

const SITE_DOMAIN = 'mapleandsprucefolkarts.com';

/** One calendar event: a single session the buyer attends. */
export interface ClassCalendarEntry {
  /** Stable per session, so re-adding updates the event instead of duplicating it. */
  uid: string;
  title: string;
  start: Date;
  end: Date;
  location?: string;
  description: string;
}

export interface ClassCalendarInput {
  name: string;
  sessions: ReadonlyArray<{ dateTime: Date | string }>;
  durationMinutes: number;
  location?: string;
  confirmationNumber: string;
  /** Private hours: the one hour booked, which replaces the class's sessions. */
  slotStart?: Date | string;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * One entry per session the buyer attends, earliest first. A private-hours
 * booking is the single hour booked, not every open hour on the class.
 */
export function classCalendarEntries(
  input: ClassCalendarInput
): ClassCalendarEntry[] {
  const starts = input.slotStart
    ? [toDate(input.slotStart)]
    : input.sessions
        .map((s) => toDate(s.dateTime))
        .filter((d) => !Number.isNaN(d.getTime()))
        .sort((a, b) => a.getTime() - b.getTime());

  const location = input.location || 'Maple & Spruce Folk Arts';
  const total = starts.length;

  return starts.map((start, i) => {
    const sessionLabel = total > 1 ? ` (session ${i + 1} of ${total})` : '';
    return {
      uid: `${input.confirmationNumber}-${i + 1}@${SITE_DOMAIN}`,
      title: `${input.name}${sessionLabel}`,
      start,
      end: new Date(start.getTime() + input.durationMinutes * 60_000),
      location,
      description: `Class at Maple & Spruce Folk Arts. Confirmation: ${input.confirmationNumber}`,
    };
  });
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/** `YYYYMMDDTHHMMSSZ`, the UTC form both .ics and Google Calendar take. */
export function toIcsDate(date: Date): string {
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  );
}

/** RFC 5545 TEXT escaping: backslash, semicolon, comma and newlines. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Fold a content line to 75 characters, continuation lines starting with a
 * space (RFC 5545 §3.1). Counts UTF-16 units, which keeps ASCII lines within
 * the octet limit and errs short for anything else.
 */
export function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) {
    parts.push(' ' + line.slice(i, i + 74));
  }
  return parts.join('\r\n');
}

/** An .ics calendar holding every entry as its own event. */
export function buildClassIcs(
  entries: ReadonlyArray<ClassCalendarEntry>,
  now: Date = new Date()
): string {
  const stamp = toIcsDate(now);
  const events = entries.flatMap((e) => [
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toIcsDate(e.start)}`,
    `DTEND:${toIcsDate(e.end)}`,
    `SUMMARY:${escapeIcsText(e.title)}`,
    ...(e.location ? [`LOCATION:${escapeIcsText(e.location)}`] : []),
    `DESCRIPTION:${escapeIcsText(e.description)}`,
    'END:VEVENT',
  ]);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Maple & Spruce//Registration//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
  ];
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

export function googleCalendarUrl(entry: ClassCalendarEntry): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: entry.title,
    dates: `${toIcsDate(entry.start)}/${toIcsDate(entry.end)}`,
    details: entry.description,
  });
  if (entry.location) params.set('location', entry.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function outlookComposeUrl(host: string, entry: ClassCalendarEntry): string {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: entry.title,
    startdt: entry.start.toISOString(),
    enddt: entry.end.toISOString(),
    body: entry.description,
  });
  if (entry.location) params.set('location', entry.location);
  return `https://${host}/calendar/0/deeplink/compose?${params.toString()}`;
}

/** Personal Outlook.com / Hotmail accounts. */
export function outlookCalendarUrl(entry: ClassCalendarEntry): string {
  return outlookComposeUrl('outlook.live.com', entry);
}

/** Work and school Microsoft 365 accounts. */
export function microsoft365CalendarUrl(entry: ClassCalendarEntry): string {
  return outlookComposeUrl('outlook.office.com', entry);
}
