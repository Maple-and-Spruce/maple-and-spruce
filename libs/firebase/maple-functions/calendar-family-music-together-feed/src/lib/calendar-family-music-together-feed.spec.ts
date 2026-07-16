import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findByCalendarToken: vi.fn(),
  findAllBySourceRef: vi.fn(),
  generateIcsFeed: vi.fn(),
}));

vi.mock('@maple/firebase/database', () => ({
  CalendarEventRepository: { findAllBySourceRef: mocks.findAllBySourceRef },
  MusicTogetherRegistrationRepository: {
    findByCalendarToken: mocks.findByCalendarToken,
  },
}));

vi.mock('@maple/ts/calendar', () => ({
  generateIcsFeed: mocks.generateIcsFeed,
  ICS_FEED_HEADERS: { 'Content-Type': 'text/calendar; charset=utf-8' },
}));

vi.mock('firebase-functions/v2/https', () => ({
  onRequest: vi.fn((_config, handler) => handler),
}));

import {
  calendarFamilyMusicTogetherFeed,
  extractFamilyToken,
} from './calendar-family-music-together-feed';

const handler = calendarFamilyMusicTogetherFeed as unknown as (
  req: unknown,
  res: unknown
) => Promise<void>;

function makeRes() {
  return {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

describe('extractFamilyToken', () => {
  it('reads the token from an .ics path', () => {
    expect(
      extractFamilyToken({ path: '/calendar/family/abc123.ics' })
    ).toBe('abc123');
  });

  it('reads the token from a query param', () => {
    expect(extractFamilyToken({ path: '/', query: { token: 'q-tok' } })).toBe(
      'q-tok'
    );
  });

  it('ignores a trailing query string on the path', () => {
    expect(
      extractFamilyToken({ url: '/calendar/family/tok.ics?foo=1' })
    ).toBe('tok');
  });

  it('returns undefined when no token is present', () => {
    expect(extractFamilyToken({ path: '/calendar/family/' })).toBeUndefined();
  });
});

describe('calendarFamilyMusicTogetherFeed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('serves only the confirmed-section events for the token', async () => {
    mocks.findByCalendarToken.mockResolvedValue([
      { sectionId: 'sec-a', status: 'confirmed' },
      { sectionId: 'sec-b', status: 'confirmed' },
      { sectionId: 'sec-c', status: 'cancelled' }, // excluded
      { sectionId: 'sec-a', status: 'confirmed' }, // duplicate section
    ]);
    mocks.findAllBySourceRef.mockImplementation((sourceRef: string) =>
      Promise.resolve([{ id: `${sourceRef}-evt` }])
    );
    mocks.generateIcsFeed.mockReturnValue('BEGIN:VCALENDAR');
    const res = makeRes();

    await handler({ method: 'GET', path: '/calendar/family/fam-tok.ics' }, res);

    expect(mocks.findByCalendarToken).toHaveBeenCalledWith('fam-tok');
    // Only the two unique confirmed sections are queried.
    expect(mocks.findAllBySourceRef).toHaveBeenCalledTimes(2);
    expect(mocks.findAllBySourceRef).toHaveBeenCalledWith(
      'musicTogetherSections/sec-a'
    );
    expect(mocks.findAllBySourceRef).toHaveBeenCalledWith(
      'musicTogetherSections/sec-b'
    );
    expect(mocks.generateIcsFeed).toHaveBeenCalledWith(
      [
        { id: 'musicTogetherSections/sec-a-evt' },
        { id: 'musicTogetherSections/sec-b-evt' },
      ],
      'Your Music Together Classes'
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('BEGIN:VCALENDAR');
    expect(res.headers['Content-Type']).toBe('text/calendar; charset=utf-8');
  });

  it('returns an empty (valid) feed for an unknown token — no enumeration', async () => {
    mocks.findByCalendarToken.mockResolvedValue([]);
    mocks.generateIcsFeed.mockReturnValue('BEGIN:VCALENDAR\r\nEND:VCALENDAR');
    const res = makeRes();

    await handler(
      { method: 'GET', path: '/calendar/family/nope.ics' },
      res
    );

    expect(mocks.findAllBySourceRef).not.toHaveBeenCalled();
    expect(mocks.generateIcsFeed).toHaveBeenCalledWith(
      [],
      'Your Music Together Classes'
    );
    expect(res.statusCode).toBe(200);
  });

  it('short-circuits an OPTIONS preflight', async () => {
    const res = makeRes();
    await handler({ method: 'OPTIONS' }, res);
    expect(res.statusCode).toBe(204);
    expect(mocks.findByCalendarToken).not.toHaveBeenCalled();
  });

  it('400s when the token is missing', async () => {
    const res = makeRes();
    await handler({ method: 'GET', path: '/calendar/family/' }, res);
    expect(res.statusCode).toBe(400);
    expect(mocks.findByCalendarToken).not.toHaveBeenCalled();
  });

  it('returns 500 when a repository throws', async () => {
    mocks.findByCalendarToken.mockRejectedValue(new Error('boom'));
    const res = makeRes();
    await handler({ method: 'GET', path: '/calendar/family/x.ics' }, res);
    expect(res.statusCode).toBe(500);
  });
});
