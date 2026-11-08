import { describe, it, expect } from 'vitest';
import { generateWeeklyDates } from './series-dates';

describe('generateWeeklyDates', () => {
  const start = new Date('2026-05-01T15:00:00Z'); // Friday

  it('generates the requested count of weekly dates', () => {
    const dates = generateWeeklyDates({ start, cadence: 'weekly', count: 4 });
    expect(dates.length).toBe(4);
    expect(dates[0].toISOString()).toBe('2026-05-01T15:00:00.000Z');
    expect(dates[1].toISOString()).toBe('2026-05-08T15:00:00.000Z');
    expect(dates[2].toISOString()).toBe('2026-05-15T15:00:00.000Z');
    expect(dates[3].toISOString()).toBe('2026-05-22T15:00:00.000Z');
  });

  it('preserves the start time-of-day on each generated date', () => {
    const dates = generateWeeklyDates({ start, cadence: 'weekly', count: 3 });
    for (const d of dates) {
      expect(d.getUTCHours()).toBe(15);
      expect(d.getUTCMinutes()).toBe(0);
    }
  });

  it('generates biweekly dates 14 days apart', () => {
    const dates = generateWeeklyDates({
      start,
      cadence: 'biweekly',
      count: 3,
    });
    expect(dates.length).toBe(3);
    expect(dates[0].toISOString()).toBe('2026-05-01T15:00:00.000Z');
    expect(dates[1].toISOString()).toBe('2026-05-15T15:00:00.000Z');
    expect(dates[2].toISOString()).toBe('2026-05-29T15:00:00.000Z');
  });

  it('respects an end date (inclusive) when count is not provided', () => {
    const dates = generateWeeklyDates({
      start,
      cadence: 'weekly',
      end: new Date('2026-05-22T15:00:00Z'),
    });
    // May 1, 8, 15, 22
    expect(dates.length).toBe(4);
    expect(dates[dates.length - 1].toISOString()).toBe(
      '2026-05-22T15:00:00.000Z'
    );
  });

  it('stops at the earlier of count and end', () => {
    const dates = generateWeeklyDates({
      start,
      cadence: 'weekly',
      count: 10,
      end: new Date('2026-05-15T15:00:00Z'),
    });
    // May 1, 8, 15
    expect(dates.length).toBe(3);
    expect(dates[2].toISOString()).toBe('2026-05-15T15:00:00.000Z');
  });

  it('caps at 260 for pathological inputs', () => {
    const dates = generateWeeklyDates({
      start,
      cadence: 'weekly',
      count: 10000,
    });
    expect(dates.length).toBe(260);
  });

  it('returns [] for an invalid start date', () => {
    const dates = generateWeeklyDates({
      start: new Date('not-a-date'),
      cadence: 'weekly',
      count: 3,
    });
    expect(dates).toEqual([]);
  });

  // Clocks fall back on Sunday Nov 1 2026. A 4:00 PM Thursday series stays at
  // 4:00 PM on the wall clock, so its UTC time moves an hour later.
  it('keeps the wall-clock time across the fall-back clock change', () => {
    const dates = generateWeeklyDates({
      start: new Date('2026-10-22T20:00:00Z'), // Thu 4:00 PM EDT
      cadence: 'weekly',
      count: 3,
    });
    expect(dates.map((d) => d.toISOString())).toEqual([
      '2026-10-22T20:00:00.000Z',
      '2026-10-29T20:00:00.000Z',
      '2026-11-05T21:00:00.000Z', // Thu 4:00 PM EST
    ]);
  });

  it('keeps the wall-clock time across the spring-forward clock change', () => {
    const dates = generateWeeklyDates({
      start: new Date('2027-03-04T21:00:00Z'), // Thu 4:00 PM EST
      cadence: 'biweekly',
      count: 2,
    });
    expect(dates[1].toISOString()).toBe('2027-03-18T20:00:00.000Z'); // 4:00 PM EDT
  });
});
