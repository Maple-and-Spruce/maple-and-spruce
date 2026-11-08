/** Cents as dollars, e.g. 1250 → "$12.50". */
export function formatGiftCardMoney(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

/** A signed amount for the history, e.g. "+$25.00" / "−$37.50". */
export function formatGiftCardChange(cents: number): string {
  if (cents === 0) return formatGiftCardMoney(0);
  const sign = cents > 0 ? '+' : '−';
  return `${sign}${formatGiftCardMoney(Math.abs(cents))}`;
}

/** A Square timestamp as a date in Eastern time, e.g. "Nov 14, 2026". */
export function formatGiftCardDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** A card code in groups of four, as printed: "7783 3200 0000 4821". */
export function formatGiftCardCode(code: string): string {
  return code.replace(/\s+/g, '').replace(/(.{4})(?=.)/g, '$1 ');
}

/**
 * Whole dollars typed by Katie, as cents: "25" or "$25.00" → 2500. Anything
 * else (blank, cents, letters) is NaN, so validation says "whole dollars".
 */
export function parseWholeDollars(text: string): number {
  const match = /^\s*\$?\s*(\d{1,6})(?:\.0{1,2})?\s*$/.exec(text);
  return match ? Number(match[1]) * 100 : Number.NaN;
}

/**
 * A fresh key for one opening of a dialog that makes something in Square.
 * Every Square key for that request is derived from it, so a retried click
 * makes one card, not two.
 */
export function newGiftCardRequestKey(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  return `issue-${random}`;
}
