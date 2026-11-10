/**
 * Codes for the studio's own gift cards (#332): printed certificates and
 * cards bought on our gift card page.
 *
 * The code is `MAPLE`, the 4-digit year, and 3 digits drawn at random, e.g.
 * `MAPLE2026482`, printed as `MAPLE 2026 482`. It is short enough to type at
 * the register and to read over the phone. A printed certificate's barcode
 * encodes the same 12 characters.
 *
 * The 3 digits are never sequential: a run of certificates must not let
 * someone holding one guess the next. When Square already has a card with
 * the drawn code, the caller draws again (`GIFT_CERTIFICATE_CODE_ATTEMPTS`).
 * That leaves room for up to 1,000 certificates a year, which is the accepted
 * capacity.
 *
 * The tradeoff: 1,000 codes a year are easy to guess compared with Square's
 * 16-digit numbers. So online lookups are limited (wrong codes lock a visitor
 * out for a while, see `giftCardWrongCodeLockout`), and the end of a MAPLE
 * code is never shown as "ending in": with the prefix and year fixed, its
 * last 4 characters are the whole code. Use `giftCardLast4`.
 *
 * Cards Square numbers itself (eGift cards sold at the register, free cards,
 * replacements) keep Square's 16-digit number.
 */

export const GIFT_CERTIFICATE_CODE_PREFIX = 'MAPLE';

/** How many codes to try for one certificate before giving up. */
export const GIFT_CERTIFICATE_CODE_ATTEMPTS = 10;

/** How many different codes one year has: 000 to 999. */
export const GIFT_CERTIFICATE_CODES_PER_YEAR = 1000;

const CODE_PATTERN = /^MAPLE(\d{4})(\d{3})$/;

/**
 * A random whole number from 0 up to, but not including, `maxExclusive`.
 * Production passes `crypto.randomInt`; tests pass a fixed sequence.
 */
export type RandomInt = (maxExclusive: number) => number;

/** The year at `now` in the studio's time zone, so New Year's Eve stays in its year. */
export function studioYear(now: Date, timeZone = 'America/New_York'): number {
  const year = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' })
    .formatToParts(now)
    .find((p) => p.type === 'year')?.value;
  return Number(year);
}

/** A new certificate code for the year at `now`, e.g. `MAPLE2026482`. */
export function makeGiftCertificateCode(now: Date, randomInt: RandomInt): string {
  const drawn = randomInt(GIFT_CERTIFICATE_CODES_PER_YEAR);
  if (!Number.isInteger(drawn) || drawn < 0 || drawn >= GIFT_CERTIFICATE_CODES_PER_YEAR) {
    throw new Error('The random source gave a number outside 0 to 999');
  }
  return `${GIFT_CERTIFICATE_CODE_PREFIX}${studioYear(now)}${String(drawn).padStart(3, '0')}`;
}

/** Whether a code is a printed certificate's, spaces ignored. */
export function isGiftCertificateCode(code: string): boolean {
  return CODE_PATTERN.test(code.replace(/\s+/g, '').toUpperCase());
}

/** `MAPLE 2026 482` from `MAPLE2026482`. Undefined for any other code. */
export function formatGiftCertificateCode(code: string): string | undefined {
  const match = CODE_PATTERN.exec(code.replace(/\s+/g, '').toUpperCase());
  return match ? `${GIFT_CERTIFICATE_CODE_PREFIX} ${match[1]} ${match[2]}` : undefined;
}

/**
 * Hide every certificate code in a piece of text, for logs. Square's error
 * for a code that is taken may quote it, and a full code must never be logged.
 */
export function redactGiftCertificateCodes(text: string): string {
  return text.replace(/MAPLE\s?\d{4}\s?\d{3}/gi, 'MAPLE••••••••');
}

/**
 * What may be shown of a card's code: the last 4 digits of a Square number,
 * or an empty string for a MAPLE code, whose last 4 characters would give the
 * whole code away (the prefix and year are fixed).
 */
export function giftCardLast4(code: string): string {
  if (isGiftCertificateCode(code)) return '';
  return code.replace(/\s+/g, '').slice(-4);
}

/**
 * ` ending 1234` to follow "Gift card", or an empty string when the card's
 * last 4 are not shown (a MAPLE code).
 */
export function giftCardEndingText(last4: string | undefined): string {
  return last4 ? ` ending ${last4}` : '';
}

/** The admin's short name for a card: `•••• 1234`, or `MAPLE ••••` for a MAPLE code. */
export function giftCardShortLabel(last4: string | undefined): string {
  return last4 ? `•••• ${last4}` : `${GIFT_CERTIFICATE_CODE_PREFIX} ••••`;
}

/** `Gift card ending 1234`, or `Gift card with a MAPLE code` when its last 4 are not shown. */
export function giftCardName(last4: string | undefined): string {
  return last4 ? `Gift card ending ${last4}` : `Gift card with a ${GIFT_CERTIFICATE_CODE_PREFIX} code`;
}
