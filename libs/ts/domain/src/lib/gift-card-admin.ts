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

// ---------------------------------------------------------------------------
// Finding a card by its customer (#332)
// ---------------------------------------------------------------------------

/** Most Square customers one search returns. */
export const GIFT_CARD_CUSTOMER_MATCH_LIMIT = 10;
/**
 * How far back register sales are searched for a customer's cards, in years.
 * Cards linked to the customer in Square are found however old they are.
 */
export const GIFT_CARD_SALE_SEARCH_YEARS = 2;
/**
 * Square cannot search customers by name, so a name is matched against the
 * most recently created customers, at most this many.
 */
export const GIFT_CARD_NAME_SEARCH_MAX_CUSTOMERS = 2000;
/** Shortest and longest customer search, in characters (after trimming). */
export const GIFT_CARD_CUSTOMER_QUERY_MIN_LENGTH = 2;
export const GIFT_CARD_CUSTOMER_QUERY_MAX_LENGTH = 100;

export type GiftCardSearchKind = 'none' | 'last4' | 'email' | 'phone' | 'name';

/**
 * What the Gift Cards search box was given: up to 4 digits are the end of a
 * card code (searched in the list on the page), more digits a phone number,
 * anything with an @ an email, and other text a name (searched in Square).
 */
export function giftCardSearchKind(input: string): GiftCardSearchKind {
  const query = input.trim();
  if (!query) return 'none';
  if (query.includes('@')) return 'email';
  const digits = query.replace(/\D/g, '');
  if (/^[\d\s()+.-]+$/.test(query)) {
    if (digits.length <= 4) return 'last4';
    return 'phone';
  }
  if (query.length < GIFT_CARD_CUSTOMER_QUERY_MIN_LENGTH) return 'none';
  return 'name';
}

/**
 * Whether a customer's name matches a typed name: every word typed starts a
 * word of the name, ignoring case, so "ash rob" finds "Robin Ashfield".
 */
export function customerNameMatches(name: string, query: string): boolean {
  const words = name.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(Boolean);
  const typed = query.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(Boolean);
  if (typed.length === 0) return false;
  return typed.every((t) => words.some((w) => w.startsWith(t)));
}
