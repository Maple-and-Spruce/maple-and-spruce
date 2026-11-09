import { formatGiftCardCode as formatDomainGiftCardCode } from '@maple/ts/domain';

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

/**
 * A card code as printed: Square's numbers in groups of four,
 * "7783 3200 0000 4821", and a printed certificate's code as
 * "MAPLE 2026 482" (#332). The domain owns the rule, so emails match.
 */
export function formatGiftCardCode(code: string): string {
  return formatDomainGiftCardCode(code);
}

/**
 * Whole dollars typed by Katie, as cents: "25" or "$25.00" → 2500. Anything
 * else (blank, cents, letters) is NaN, so validation says "whole dollars".
 */
export function parseWholeDollars(text: string): number {
  const match = /^\$?(\d{1,6})(?:\.00?)?$/.exec(text.replace(/\s/g, ''));
  return match ? Number(match[1]) * 100 : Number.NaN;
}

/**
 * A fresh key for one opening of a dialog that makes something in Square.
 * Every Square key for that request is derived from it, so a retried click
 * makes one card, not two.
 */
export function newGiftCardRequestKey(): string {
  return `issue-${crypto.randomUUID()}`;
}
