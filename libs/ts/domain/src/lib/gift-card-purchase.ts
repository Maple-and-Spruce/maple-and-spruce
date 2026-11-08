/**
 * Buying a gift card on our own buy page (#300).
 *
 * Shared by the purchase route, its validation suite, the Webflow widget and
 * the emails, so the limits and the wording of "what this card is for" are
 * the same everywhere.
 */
import type { GiftCardPurchase } from './gift-card';

/** Smallest dollar gift card sold online, in cents. */
export const GIFT_CARD_MIN_CENTS = 1000;
/** Largest dollar gift card sold online, in cents. */
export const GIFT_CARD_MAX_CENTS = 50000;
/** The amounts offered as one-tap choices on the buy page, in cents. */
export const GIFT_CARD_PRESET_CENTS: readonly number[] = [2500, 5000, 10000];
/** Longest personal message, in characters. */
export const GIFT_CARD_MESSAGE_MAX_LENGTH = 300;

/**
 * Whether a dollar amount can be sold online: whole dollars, $10 to $500.
 */
export function isAllowedGiftCardAmount(amountCents: unknown): boolean {
  return (
    typeof amountCents === 'number' &&
    Number.isInteger(amountCents) &&
    amountCents % 100 === 0 &&
    amountCents >= GIFT_CARD_MIN_CENTS &&
    amountCents <= GIFT_CARD_MAX_CENTS
  );
}

/**
 * A card code in groups of four, the way it is easiest to read aloud or copy
 * onto a card: `7783 3200 0000 1111`.
 */
export function formatGiftCardCode(code: string): string {
  return code
    .replace(/\s+/g, '')
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

/** `$25.00` from 2500. */
export function formatGiftCardDollars(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/**
 * What the card is for, in one line for the email and the admin:
 * "$50" or "One Pottery class at Maple & Spruce (Wheel Throwing 101 or any
 * class of that type)".
 */
export function describeGiftCardPurchase(
  purchase: Pick<GiftCardPurchase, 'kind' | 'valueCents' | 'className'> & {
    classCategoryName?: string;
  }
): string {
  if (purchase.kind !== 'class') {
    return formatGiftCardDollars(purchase.valueCents);
  }
  const type = purchase.classCategoryName?.trim();
  const name = purchase.className?.trim();
  const head = type ? `One ${type} class at Maple & Spruce` : 'One class at Maple & Spruce';
  return name ? `${head} (${name} or any class of that type)` : head;
}
