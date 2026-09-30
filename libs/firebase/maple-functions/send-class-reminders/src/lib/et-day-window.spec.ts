import { describe, it, expect } from 'vitest';
import { getEtDayWindow } from './et-day-window';

const iso = (w: { start: Date; end: Date }) => ({
  start: w.start.toISOString(),
  end: w.end.toISOString(),
});

describe('getEtDayWindow', () => {
  it('returns today in ET for offset 0 (EDT)', () => {
    // 8:00 AM EDT, when the schedule fires.
    const now = new Date('2026-09-29T12:00:00.000Z');
    expect(iso(getEtDayWindow(now))).toEqual({
      start: '2026-09-29T04:00:00.000Z',
      end: '2026-09-30T03:59:59.999Z',
    });
  });

  it('uses the ET date, not the UTC date, late in the ET evening', () => {
    // 11:30 PM EDT on Sep 29 is already Sep 30 in UTC.
    const now = new Date('2026-09-30T03:30:00.000Z');
    expect(iso(getEtDayWindow(now)).start).toBe('2026-09-29T04:00:00.000Z');
  });

  it('returns the ET day a week out', () => {
    const now = new Date('2026-09-29T12:00:00.000Z');
    expect(iso(getEtDayWindow(now, 7))).toEqual({
      start: '2026-10-06T04:00:00.000Z',
      end: '2026-10-07T03:59:59.999Z',
    });
  });

  it('uses the target day offset when the week crosses the end of DST', () => {
    // Today is EDT; Nov 5 is EST (DST ends Nov 1, 2026).
    const now = new Date('2026-10-29T12:00:00.000Z');
    expect(iso(getEtDayWindow(now, 7))).toEqual({
      start: '2026-11-05T05:00:00.000Z',
      end: '2026-11-06T04:59:59.999Z',
    });
  });

  it('covers the 25-hour fall-back day exactly', () => {
    const now = new Date('2026-10-25T12:00:00.000Z');
    expect(iso(getEtDayWindow(now, 7))).toEqual({
      start: '2026-11-01T04:00:00.000Z',
      end: '2026-11-02T04:59:59.999Z',
    });
  });

  it('covers the 23-hour spring-forward day exactly', () => {
    const now = new Date('2027-03-07T13:00:00.000Z');
    expect(iso(getEtDayWindow(now, 7))).toEqual({
      start: '2027-03-14T05:00:00.000Z',
      end: '2027-03-15T03:59:59.999Z',
    });
  });

  it('rolls over month ends', () => {
    const now = new Date('2026-12-28T13:00:00.000Z');
    expect(iso(getEtDayWindow(now, 7)).start).toBe('2027-01-04T05:00:00.000Z');
  });
});
