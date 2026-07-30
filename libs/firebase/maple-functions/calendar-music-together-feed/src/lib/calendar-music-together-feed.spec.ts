import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findPublicByType: vi.fn(),
  generateIcsFeed: vi.fn(),
}));

vi.mock('@maple/firebase/database', () => ({
  CalendarEventRepository: { findPublicByType: mocks.findPublicByType },
}));

vi.mock('@maple/ts/calendar', () => ({
  generateIcsFeed: mocks.generateIcsFeed,
  ICS_FEED_HEADERS: { 'Content-Type': 'text/calendar; charset=utf-8' },
}));

// Unwrap the onRequest handler so it can be invoked with a plain req/res.
vi.mock('firebase-functions/v2/https', () => ({
  onRequest: vi.fn((_config, handler) => handler),
}));

import { calendarMusicTogetherFeed } from './calendar-music-together-feed';

const handler = calendarMusicTogetherFeed as unknown as (
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

describe('calendarMusicTogetherFeed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('serves an ICS feed of public Music Together events', async () => {
    mocks.findPublicByType.mockResolvedValue([{ id: 'e1' }]);
    mocks.generateIcsFeed.mockReturnValue('BEGIN:VCALENDAR');
    const res = makeRes();

    await handler({ method: 'GET' }, res);

    expect(mocks.findPublicByType).toHaveBeenCalledWith('musictogether');
    expect(mocks.generateIcsFeed).toHaveBeenCalledWith(
      [{ id: 'e1' }],
      'Music Together Maple & Spruce'
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('BEGIN:VCALENDAR');
    expect(res.headers['Content-Type']).toBe('text/calendar; charset=utf-8');
  });

  it('short-circuits an OPTIONS preflight', async () => {
    const res = makeRes();
    await handler({ method: 'OPTIONS' }, res);
    expect(res.statusCode).toBe(204);
    expect(mocks.findPublicByType).not.toHaveBeenCalled();
  });

  it('returns 500 when the repository throws', async () => {
    mocks.findPublicByType.mockRejectedValue(new Error('boom'));
    const res = makeRes();
    await handler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(500);
  });
});
