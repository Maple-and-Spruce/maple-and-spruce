import { describe, it, expect } from 'vitest';
import { formatWeekdayTimeBlock } from './schedule-format';

// All fixtures use explicit UTC instants and assert against America/New_York
// output, so the tests are deterministic regardless of the machine's zone.
// 2026-04-13 is a Monday, 2026-04-15 a Wednesday.
const mon6pmET = '2026-04-13T22:00:00.000Z'; // 6:00 PM EDT
const wed6pmET = '2026-04-15T22:00:00.000Z'; // 6:00 PM EDT
const mon6pmWeek2 = '2026-04-20T22:00:00.000Z'; // next Monday, 6:00 PM EDT

describe('formatWeekdayTimeBlock', () => {
  it('returns empties for no starts', () => {
    const r = formatWeekdayTimeBlock([], 60);
    expect(r.dayDisplay).toBe('');
    expect(r.timeBlockDisplay).toBe('');
    expect(r.dateRangeDisplay).toBe('');
    expect(r.count).toBe(0);
    expect(r.weekdaySortKey).toBe(Number.POSITIVE_INFINITY);
    expect(r.dateSortKey).toBe(Number.POSITIVE_INFINITY);
  });

  it('single session keeps the weekday singular and a single date', () => {
    const r = formatWeekdayTimeBlock([mon6pmET], 90);
    expect(r.dayDisplay).toBe('Monday');
    expect(r.timeBlockDisplay).toBe('6:00–7:30 PM');
    expect(r.dateRangeDisplay).toBe('Apr 13');
    expect(r.count).toBe(1);
  });

  it('pluralizes a recurring single-weekday class and shows a date range', () => {
    const r = formatWeekdayTimeBlock([mon6pmET, mon6pmWeek2], 60);
    expect(r.dayDisplay).toBe('Mondays');
    expect(r.timeBlockDisplay).toBe('6:00–7:00 PM');
    expect(r.dateRangeDisplay).toBe('Apr 13 – Apr 20');
    expect(r.count).toBe(2);
  });

  it('joins multiple weekdays with an ampersand, ordered by weekday index', () => {
    // pass out of order to confirm sorting
    const r = formatWeekdayTimeBlock([wed6pmET, mon6pmET], 90);
    expect(r.dayDisplay).toBe('Mon & Wed');
    expect(r.timeBlockDisplay).toBe('6:00–7:30 PM');
  });

  it('reports "Varies" when start times differ across sessions', () => {
    const wed7pmET = '2026-04-15T23:00:00.000Z'; // 7:00 PM EDT
    const r = formatWeekdayTimeBlock([mon6pmET, wed7pmET], 60);
    expect(r.dayDisplay).toBe('Mon & Wed');
    expect(r.timeBlockDisplay).toBe('Varies');
  });

  it('keeps both meridiems when the block crosses noon', () => {
    const mon1130amET = '2026-04-13T15:30:00.000Z'; // 11:30 AM EDT
    const r = formatWeekdayTimeBlock([mon1130amET], 60);
    expect(r.timeBlockDisplay).toBe('11:30 AM–12:30 PM');
  });

  it('derives the weekday in ET, not UTC (late-night ET session)', () => {
    // 2026-04-14T01:30Z is still Monday 9:30 PM in ET (not Tuesday).
    const r = formatWeekdayTimeBlock(['2026-04-14T01:30:00.000Z'], 60);
    expect(r.dayDisplay).toBe('Monday');
    expect(r.timeBlockDisplay).toBe('9:30–10:30 PM');
  });

  it('sort keys order by weekday then start time, and by first date', () => {
    const mon = formatWeekdayTimeBlock([mon6pmET], 60);
    const wed = formatWeekdayTimeBlock([wed6pmET], 60);
    expect(mon.weekdaySortKey).toBeLessThan(wed.weekdaySortKey);
    expect(mon.dateSortKey).toBeLessThan(wed.dateSortKey);
  });

  it('accepts Date instances and ignores invalid dates', () => {
    const r = formatWeekdayTimeBlock(
      [new Date(mon6pmET), new Date('nonsense')],
      60
    );
    expect(r.count).toBe(1);
    expect(r.dayDisplay).toBe('Monday');
  });
});
