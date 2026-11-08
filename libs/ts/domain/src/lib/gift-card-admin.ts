/**
 * Gift cards Katie makes or records from the admin Gift Cards page (#310).
 *
 * Two actions, both admin only:
 *
 * - **Make it a class certificate**: a card sold at the register gets a record
 *   saying which class type it covers, so class checkout can add the 10%
 *   cushion (`classCertificateCushionCents`). Nothing changes in Square.
 * - **Give a free card**: the studio makes and loads a card without a sale.
 *   No money comes in; the value comes out of the studio's pocket when spent.
 *
 * Shared by the routes, their validation suites and the admin dialogs, so the
 * limits are the same everywhere.
 */
import type { GiftCardActivityEntry } from './gift-card';

/** Smallest free card, in cents. */
export const ISSUED_GIFT_CARD_MIN_CENTS = 500;
/** Largest free card, in cents. */
export const ISSUED_GIFT_CARD_MAX_CENTS = 50000;
/** Shortest reason for a free card, in characters (after trimming). */
export const ISSUED_GIFT_CARD_REASON_MIN_LENGTH = 3;
/** Longest reason for a free card, in characters. */
export const ISSUED_GIFT_CARD_REASON_MAX_LENGTH = 200;
/** Longest To or From name on a certificate, in characters. */
export const GIFT_CARD_NAME_MAX_LENGTH = 100;

/** Whether a free card's value is allowed: whole dollars, $5 to $500. */
export function isAllowedIssuedGiftCardAmount(amountCents: unknown): boolean {
  return (
    typeof amountCents === 'number' &&
    Number.isInteger(amountCents) &&
    amountCents % 100 === 0 &&
    amountCents >= ISSUED_GIFT_CARD_MIN_CENTS &&
    amountCents <= ISSUED_GIFT_CARD_MAX_CENTS
  );
}

/**
 * What a card was loaded with when it was made, in cents: the amount of its
 * activation, or, for a card Square shows no activation for, its first load.
 * Not the current balance, which drops as the card is spent.
 *
 * Undefined when the history shows neither (Square left the amount out, or
 * the card was never loaded).
 */
export function originalGiftCardValueCents(
  activities: readonly GiftCardActivityEntry[]
): number | undefined {
  const oldestFirst = [...activities].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );
  for (const type of ['activate', 'load'] as const) {
    const first = oldestFirst.find(
      (a) => a.type === type && a.amountCents !== null && a.amountCents > 0
    );
    if (first?.amountCents) return first.amountCents;
  }
  return undefined;
}

/**
 * A gift card code the studio chooses (#custom codes), e.g. "FERN REEL HARP
 * 4821". Square takes 8 to 20 letters and digits for a card it did not
 * number itself, unique on the account. Spaces and dashes are for people only.
 */
export function normalizeGiftCardCode(input: string): string {
  return input.replace(/[\s-]+/g, '').toUpperCase();
}

/**
 * Why a chosen code can't be used, or undefined if it can. A number-only code
 * must not start like a bank card (2 to 6), which Square refuses.
 */
export function customGiftCardCodeProblem(input: string): string | undefined {
  const code = normalizeGiftCardCode(input);
  if (!/^[A-Z\d]+$/.test(code)) return 'Use only letters and numbers';
  if (code.length < 8 || code.length > 20) return 'Use 8 to 20 letters and numbers';
  if (/^\d+$/.test(code) && /^[2-6]/.test(code)) {
    return 'A number-only code cannot start with 2, 3, 4, 5 or 6';
  }
  return undefined;
}
