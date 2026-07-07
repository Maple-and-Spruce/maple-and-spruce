import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findPrivate: vi.fn(),
  generateIcsFeed: vi.fn(),
}));

vi.mock('@maple/firebase/database', () => ({
  CalendarEventRepository: { findPrivate: mocks.findPrivate },
}));

vi.mock('@maple/ts/calendar', () => ({
  generateIcsFeed: mocks.generateIcsFeed,
  ICS_FEED_HEADERS: { 'Content-Type': 'text/calendar; charset=utf-8' },
}));

// Unwrap the onRequest handler so it can be invoked with a plain req/res.
vi.mock('firebase-functions/v2/https', () => ({
  onRequest: vi.fn((_config, handler) => handler),
}));

import { calendarPrivateFeed } from './calendar-private-feed';

const handler = calendarPrivateFeed as unknown as (
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

describe('calendarPrivateFeed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('serves an ICS feed of private events', async () => {
    mocks.findPrivate.mockResolvedValue([{ id: 'e1' }]);
    mocks.generateIcsFeed.mockReturnValue('BEGIN:VCALENDAR');
    const res = makeRes();

    await handler({ method: 'GET' }, res);

    expect(mocks.findPrivate).toHaveBeenCalledWith();
    expect(mocks.generateIcsFeed).toHaveBeenCalledWith(
      [{ id: 'e1' }],
      'Maple & Spruce Planning'
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('BEGIN:VCALENDAR');
    expect(res.headers['Content-Type']).toBe('text/calendar; charset=utf-8');
  });

  it('short-circuits an OPTIONS preflight', async () => {
    const res = makeRes();
    await handler({ method: 'OPTIONS' }, res);
    expect(res.statusCode).toBe(204);
    expect(mocks.findPrivate).not.toHaveBeenCalled();
  });

  it('returns 500 when the repository throws', async () => {
    mocks.findPrivate.mockRejectedValue(new Error('boom'));
    const res = makeRes();
    await handler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(500);
  });
});
