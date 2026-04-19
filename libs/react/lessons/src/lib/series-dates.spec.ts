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
});
