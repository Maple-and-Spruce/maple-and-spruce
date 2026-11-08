import { describe, expect, it } from 'vitest';
import {
  buildClassIcs,
  classCalendarEntries,
  escapeIcsText,
  foldIcsLine,
  googleCalendarUrl,
  microsoft365CalendarUrl,
  outlookCalendarUrl,
  type ClassCalendarEntry,
} from './class-calendar';

const ONE_SESSION = {
  name: 'Basket Weaving, Beginners; Spring',
  sessions: [{ dateTime: '2030-05-14T22:00:00.000Z' }],
  durationMinutes: 180,
  location: 'Maple & Spruce Folk Arts',
  confirmationNumber: 'MS-TEST1',
};

const THREE_SESSIONS = {
  ...ONE_SESSION,
  name: 'Wheel Throwing',
  // Out of order on purpose: entries come back earliest first.
  sessions: [
    { dateTime: new Date('2030-05-28T22:00:00.000Z') },
    { dateTime: new Date('2030-05-14T22:00:00.000Z') },
    { dateTime: new Date('2030-05-21T22:00:00.000Z') },
  ],
};

describe('classCalendarEntries', () => {
  it('makes one entry for a one-session class, ending after the duration', () => {
    const [entry, ...rest] = classCalendarEntries(ONE_SESSION);
    expect(rest).toEqual([]);
    expect(entry.title).toBe(ONE_SESSION.name);
    expect(entry.start.toISOString()).toBe('2030-05-14T22:00:00.000Z');
    expect(entry.end.toISOString()).toBe('2030-05-15T01:00:00.000Z');
    expect(entry.uid).toBe('MS-TEST1-1@mapleandsprucefolkarts.com');
    expect(entry.description).toContain('MS-TEST1');
  });

  it('makes one entry per session, earliest first, numbered in the title', () => {
    const entries = classCalendarEntries(THREE_SESSIONS);
    expect(entries.map((e) => e.start.toISOString())).toEqual([
      '2030-05-14T22:00:00.000Z',
      '2030-05-21T22:00:00.000Z',
      '2030-05-28T22:00:00.000Z',
    ]);
    expect(entries.map((e) => e.title)).toEqual([
      'Wheel Throwing (session 1 of 3)',
      'Wheel Throwing (session 2 of 3)',
      'Wheel Throwing (session 3 of 3)',
    ]);
    expect(new Set(entries.map((e) => e.uid)).size).toBe(3);
  });

  it('uses only the booked hour for private hours, not every open hour', () => {
    const entries = classCalendarEntries({
      ...THREE_SESSIONS,
      durationMinutes: 60,
      slotStart: '2030-05-21T23:00:00.000Z',
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe('Wheel Throwing');
    expect(entries[0].start.toISOString()).toBe('2030-05-21T23:00:00.000Z');
    expect(entries[0].end.toISOString()).toBe('2030-05-22T00:00:00.000Z');
  });

  it('falls back to the studio name when the class has no location', () => {
    const [entry] = classCalendarEntries({ ...ONE_SESSION, location: undefined });
    expect(entry.location).toBe('Maple & Spruce Folk Arts');
  });
});

describe('buildClassIcs', () => {
  const now = new Date('2030-01-01T12:00:00Z');

  it('writes the fields RFC 5545 requires, in UTC', () => {
    const ics = buildClassIcs(classCalendarEntries(ONE_SESSION), now);
    expect(ics).toContain('UID:MS-TEST1-1@mapleandsprucefolkarts.com');
    expect(ics).toContain('DTSTAMP:20300101T120000Z');
    expect(ics).toContain('DTSTART:20300514T220000Z');
    expect(ics).toContain('DTEND:20300515T010000Z');
    expect(ics).toContain('METHOD:PUBLISH');
  });

  it('escapes commas and semicolons in text', () => {
    const ics = buildClassIcs(classCalendarEntries(ONE_SESSION), now);
    expect(ics).toContain('SUMMARY:Basket Weaving\\, Beginners\\; Spring');
  });

  it('holds one VEVENT per session', () => {
    const ics = buildClassIcs(classCalendarEntries(THREE_SESSIONS), now);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(ics).toContain('DTSTART:20300528T220000Z');
  });

  it('uses CRLF line endings throughout', () => {
    const ics = buildClassIcs(classCalendarEntries(ONE_SESSION), now);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });
});

describe('escapeIcsText', () => {
  it('escapes backslashes and newlines', () => {
    expect(escapeIcsText('a\\b\nc')).toBe('a\\\\b\\nc');
  });
});

describe('foldIcsLine', () => {
  it('leaves short lines alone', () => {
    expect(foldIcsLine('SUMMARY:short')).toBe('SUMMARY:short');
  });

  it('folds long lines into 75-character pieces that unfold back', () => {
    const line = 'DESCRIPTION:' + 'x'.repeat(200);
    const folded = foldIcsLine(line);
    for (const part of folded.split('\r\n')) {
      expect(part.length).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });
});

describe('calendar links', () => {
  const [entry]: ClassCalendarEntry[] = classCalendarEntries(ONE_SESSION);

  it('pre-fills Google Calendar with title, UTC dates, details and location', () => {
    const url = new URL(googleCalendarUrl(entry));
    expect(url.origin + url.pathname).toBe(
      'https://calendar.google.com/calendar/render'
    );
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe(entry.title);
    expect(url.searchParams.get('dates')).toBe(
      '20300514T220000Z/20300515T010000Z'
    );
    expect(url.searchParams.get('details')).toBe(entry.description);
    expect(url.searchParams.get('location')).toBe(entry.location);
  });

  it('pre-fills Outlook.com and Microsoft 365 on their own hosts', () => {
    for (const [build, host] of [
      [outlookCalendarUrl, 'outlook.live.com'],
      [microsoft365CalendarUrl, 'outlook.office.com'],
    ] as const) {
      const url = new URL(build(entry));
      expect(url.hostname).toBe(host);
      expect(url.searchParams.get('rru')).toBe('addevent');
      expect(url.searchParams.get('subject')).toBe(entry.title);
      expect(url.searchParams.get('startdt')).toBe('2030-05-14T22:00:00.000Z');
      expect(url.searchParams.get('enddt')).toBe('2030-05-15T01:00:00.000Z');
      expect(url.searchParams.get('location')).toBe(entry.location);
    }
  });
});
