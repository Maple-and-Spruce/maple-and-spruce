import { describe, it, expect } from 'vitest';
import {
  formatDay,
  formatMoney,
  formatMonth,
  formatRate,
  formatSessionDate,
  lastMonthKey,
  shiftMonth,
  todayKey,
} from './payout-format';

describe('payout-format', () => {
  it('formats money, with a real minus sign for clawbacks', () => {
    expect(formatMoney(123450)).toBe('$1,234.50');
    expect(formatMoney(-4000)).toBe('−$40.00');
    expect(formatMoney(0)).toBe('$0.00');
  });

  it('names and steps months across year boundaries', () => {
    expect(formatMonth('2026-10')).toBe('October 2026');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('defaults to last month in studio time', () => {
    // 1:30 AM Nov 1 Eastern: last month is October.
    expect(lastMonthKey(new Date('2026-11-01T05:30:00Z'))).toBe('2026-10');
    // 11 PM Oct 31 Eastern (already Nov 1 in UTC) — last month is September.
    expect(lastMonthKey(new Date('2026-11-01T03:00:00Z'))).toBe('2026-09');
  });

  it('formats rates, sessions and calendar days', () => {
    expect(formatRate(0.8)).toBe('80%');
    expect(formatRate(0.625)).toBe('62.5%');
    expect(formatRate(undefined)).toBe('—');
    expect(formatSessionDate(new Date('2026-10-07T22:00:00Z'))).toBe('Oct 7');
    expect(formatDay('2026-11-05')).toBe('Nov 5, 2026');
    expect(todayKey(new Date(2026, 10, 5, 9))).toBe('2026-11-05');
  });
});
