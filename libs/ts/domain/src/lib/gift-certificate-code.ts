/**
 * Codes for printed gift certificates (#332).
 *
 * A printed certificate's code is `MAPLE`, the 4-digit year, and 3 digits
 * drawn at random, e.g. `MAPLE2026482`, printed as `MAPLE 2026 482`. It is
 * short enough to type at the register and to read over the phone. The
 * barcode on the certificate encodes the same 12 characters.
 *
 * The 3 digits are never sequential: a run of certificates must not let
 * someone holding one guess the next. When Square already has a card with
 * the drawn code, the caller draws again (`GIFT_CERTIFICATE_CODE_ATTEMPTS`).
 * That leaves room for up to 1,000 certificates a year, which is the accepted
 * capacity.
 *
 * The tradeoff: 1,000 codes a year are easy to guess compared with Square's
 * 16-digit numbers. That is fine at the register, where a person reads the
 * certificate, but online gift card checkout needs a lockout after repeated
 * wrong codes before it is switched on (see docs/guides/gift-cards.md).
 *
 * Every other card keeps Square's own number.
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
