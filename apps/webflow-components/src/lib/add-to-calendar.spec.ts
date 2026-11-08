import { describe, expect, it } from 'vitest';
import {
  buildIcs,
  escapeIcsText,
  foldIcsLine,
  googleCalendarUrl,
  isIosNonSafari,
  outlookCalendarUrl,
  type CalendarEvent,
} from './add-to-calendar';

const EVENT: CalendarEvent = {
  start: '2030-05-14T22:00:00.000Z',
  end: '2030-05-15T01:00:00.000Z',
  title: 'Basket Weaving, Beginners; Session 1',
  location: 'Maple & Spruce Folk Arts',
  description: 'Class at Maple & Spruce Folk Arts. Confirmation: MS-TEST1',
  uid: 'MS-TEST1@mapleandsprucefolkarts.com',
};

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
  iphoneFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0',
  ipadDesktopSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
};

describe('isIosNonSafari', () => {
  it('is false for Safari on iPhone, which opens an .ics in Calendar', () => {
    expect(isIosNonSafari(UA.iphoneSafari)).toBe(false);
  });

  it('is true for Chrome and Firefox on iPhone', () => {
    expect(isIosNonSafari(UA.iphoneChrome)).toBe(true);
    expect(isIosNonSafari(UA.iphoneFirefox)).toBe(true);
  });

  it('is true for an in-app browser on iPhone', () => {
    expect(isIosNonSafari(UA.iphoneInstagram)).toBe(true);
  });

  it('treats a touch "Mac" as an iPad, and its Safari as Safari', () => {
    expect(isIosNonSafari(UA.ipadDesktopSafari, 5)).toBe(false);
  });

  it('is false off iOS', () => {
    expect(isIosNonSafari(UA.macChrome)).toBe(false);
    expect(isIosNonSafari(UA.ipadDesktopSafari, 0)).toBe(false);
    expect(isIosNonSafari(UA.androidChrome, 5)).toBe(false);
  });
});

describe('buildIcs', () => {
  const ics = buildIcs(EVENT, new Date('2030-01-01T12:00:00Z'));

  it('carries the UID and DTSTAMP that RFC 5545 requires', () => {
    expect(ics).toContain('UID:MS-TEST1@mapleandsprucefolkarts.com');
    expect(ics).toContain('DTSTAMP:20300101T120000Z');
  });

  it('writes the times in UTC', () => {
    expect(ics).toContain('DTSTART:20300514T220000Z');
    expect(ics).toContain('DTEND:20300515T010000Z');
  });

  it('escapes commas and semicolons in text', () => {
    expect(ics).toContain('SUMMARY:Basket Weaving\\, Beginners\\; Session 1');
  });

  it('uses CRLF line endings throughout', () => {
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('leaves out LOCATION when there is none', () => {
    expect(buildIcs({ ...EVENT, location: undefined })).not.toContain(
      'LOCATION:'
    );
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

describe('googleCalendarUrl', () => {
  it('pre-fills title, UTC dates, details and location', () => {
    const url = new URL(googleCalendarUrl(EVENT));
    expect(url.origin + url.pathname).toBe(
      'https://calendar.google.com/calendar/render'
    );
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe(EVENT.title);
    expect(url.searchParams.get('dates')).toBe(
      '20300514T220000Z/20300515T010000Z'
    );
    expect(url.searchParams.get('details')).toBe(EVENT.description);
    expect(url.searchParams.get('location')).toBe(EVENT.location);
  });
});

describe('outlookCalendarUrl', () => {
  it('pre-fills subject, ISO times, body and location', () => {
    const url = new URL(outlookCalendarUrl(EVENT));
    expect(url.hostname).toBe('outlook.live.com');
    expect(url.searchParams.get('rru')).toBe('addevent');
    expect(url.searchParams.get('subject')).toBe(EVENT.title);
    expect(url.searchParams.get('startdt')).toBe('2030-05-14T22:00:00.000Z');
    expect(url.searchParams.get('enddt')).toBe('2030-05-15T01:00:00.000Z');
    expect(url.searchParams.get('body')).toBe(EVENT.description);
    expect(url.searchParams.get('location')).toBe(EVENT.location);
  });
});
