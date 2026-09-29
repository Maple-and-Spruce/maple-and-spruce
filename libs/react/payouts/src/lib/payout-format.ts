import { monthKeyInStudioZone } from '@maple/ts/domain';

/** "$1,234.50", or "−$40.00" for a negative amount (a refund clawback). */
export function formatMoney(cents: number): string {
  const formatted = (Math.abs(cents) / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
  return cents < 0 ? `−${formatted}` : formatted;
}

/** `2026-10` → "October 2026". */
export function formatMonth(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1, 15)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** `2026-10`, +1 → `2026-11`. */
export function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(year, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The month before the current one, in studio time — the one usually being paid. */
export function lastMonthKey(now: Date = new Date()): string {
  return shiftMonth(monthKeyInStudioZone(now), -1);
}

/** 0.8 → "80%". */
export function formatRate(rate: number | undefined): string {
  return rate === undefined ? '—' : `${Math.round(rate * 1000) / 10}%`;
}

/** A session start, e.g. "Oct 7". */
export function formatSessionDate(at: Date): string {
  return at.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}

/** `2026-11-05` → "Nov 5, 2026" (a calendar day, no timezone shift). */
export function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Today as `YYYY-MM-DD` in the browser's timezone, for a date input's default. */
export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
