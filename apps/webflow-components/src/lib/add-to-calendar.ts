/**
 * "Add to Calendar" for a single class session.
 *
 * A downloaded .ics only reaches a calendar in some browsers. Safari on iPhone
 * opens it in Calendar, but Chrome, Firefox, Edge and in-app browsers on iOS
 * (Instagram, Facebook) just offer to save the file. So the widget offers
 * links straight into Google and Outlook calendars, which work in any browser,
 * alongside the .ics for Apple Calendar and desktop apps.
 */

export interface CalendarEvent {
  /** ISO start time. */
  start: string;
  /** ISO end time. */
  end: string;
  title: string;
  location?: string;
  description: string;
  /** Stable id for the event, so re-adding updates instead of duplicating. */
  uid: string;
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

export function buildIcs(event: CalendarEvent, now: Date = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Maple & Spruce//Registration//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${toIcsDate(now)}`,
    `DTSTART:${toIcsDate(new Date(event.start))}`,
    `DTEND:${toIcsDate(new Date(event.end))}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    ...(event.location ? [`LOCATION:${escapeIcsText(event.location)}`] : []),
    `DESCRIPTION:${escapeIcsText(event.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${toIcsDate(new Date(event.start))}/${toIcsDate(new Date(event.end))}`,
    details: event.description,
  });
  if (event.location) params.set('location', event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function outlookCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: new Date(event.start).toISOString(),
    enddt: new Date(event.end).toISOString(),
    body: event.description,
  });
  if (event.location) params.set('location', event.location);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/**
 * True for an iOS browser that is not Safari: Chrome, Firefox, Edge, Opera,
 * the Google app, and in-app web views. These save an .ics as a file instead
 * of opening it in Calendar.
 */
export function isIosNonSafari(
  userAgent: string,
  maxTouchPoints = 0
): boolean {
  const isIos =
    /iPhone|iPad|iPod/.test(userAgent) ||
    // iPadOS asks for the desktop site and reports itself as a Mac.
    (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  if (!isIos) return false;
  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\//.test(userAgent);
  // In-app web views (Instagram, Facebook, Gmail) leave out "Safari/".
  const looksLikeSafari =
    /Version\/\d/.test(userAgent) && /Safari\//.test(userAgent);
  return otherBrowser || !looksLikeSafari;
}

/** Download the event as `class.ics`. */
export function downloadIcs(event: CalendarEvent, filename = 'class.ics'): void {
  const blob = new Blob([buildIcs(event)], {
    type: 'text/calendar;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoking straight away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
