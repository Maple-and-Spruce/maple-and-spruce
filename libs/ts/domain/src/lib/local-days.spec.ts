import { describe, expect, it } from 'vitest';
import { addLocalDays, startOfLocalWeek } from './local-days';

/**
 * These only bite in a timezone with daylight saving. CI runs the unit suite
 * twice, once in UTC and once in America/New_York, so the clock-change weeks
 * below are checked where they matter.
 */
const dayKey = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

describe('addLocalDays', () => {
  it('labels each day of the fall-back week once (Nov 1 2026)', () => {
    const sunday = new Date(2026, 10, 1); // local midnight, clocks fall back today
    const labels = [0, 1, 2, 3, 4, 5, 6].map((i) =>
      dayKey(addLocalDays(sunday, i)),
    );
    expect(labels).toEqual([
      '11/1', '11/2', '11/3', '11/4', '11/5', '11/6', '11/7',
    ]);
  });

  it('keeps local midnight across the spring-forward week (Mar 14 2027)', () => {
    const sunday = new Date(2027, 2, 14);
    const monday = addLocalDays(sunday, 1);
    expect(dayKey(monday)).toBe('3/15');
    expect(monday.getHours()).toBe(0);
  });

  it('steps back a week onto the previous Sunday across a clock change', () => {
    const sunday = new Date(2026, 10, 8);
    const prev = addLocalDays(sunday, -7);
    expect(dayKey(prev)).toBe('11/1');
    expect(prev.getDay()).toBe(0);
    expect(prev.getHours()).toBe(0);
  });
});

describe('startOfLocalWeek', () => {
  it('returns local Sunday midnight', () => {
    const s = startOfLocalWeek(new Date(2026, 10, 7, 15, 30)); // Sat afternoon
    expect(dayKey(s)).toBe('11/1');
    expect(s.getDay()).toBe(0);
    expect(s.getHours()).toBe(0);
  });
});
