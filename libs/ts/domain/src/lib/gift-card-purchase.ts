/**
 * Buying a gift card on our own buy page (#300).
 *
 * Shared by the purchase route, its validation suite, the Webflow widget and
 * the emails, so the limits and the wording of "what this card is for" are
 * the same everywhere.
 */
import type { GiftCardPurchase } from './gift-card';

/**
 * Smallest dollar gift card sold online, in cents, until Katie sets her own
 * in Admin > Settings (#309).
 */
export const GIFT_CARD_MIN_CENTS = 1000;
/** Largest dollar gift card sold online, in cents, until Katie sets her own. */
export const GIFT_CARD_MAX_CENTS = 50000;
/** The one-tap amounts on the buy page, in cents, until Katie sets her own. */
export const GIFT_CARD_PRESET_CENTS: readonly number[] = [2500, 5000, 10000];

/** The lowest "lowest amount" Settings accepts, in cents ($5). */
export const GIFT_CARD_SETTINGS_FLOOR_CENTS = 500;
/** The highest "highest amount" Settings accepts, in cents ($1,000). */
export const GIFT_CARD_SETTINGS_CEILING_CENTS = 100000;
/** How many one-tap amounts the buy page can show. */
export const GIFT_CARD_MAX_PRESETS = 4;

/**
 * What the website sells as dollar gift cards (#309). Stored at
 * `appConfig/giftCards`; reads as the defaults below until it is edited.
 */
export interface GiftCardAmountSettings {
  /** One-tap amounts, in cents, smallest first. 1 to 4 of them. */
  presetCents: number[];
  /** Lowest "Other amount", in cents. */
  minCents: number;
  /** Highest "Other amount", in cents. */
  maxCents: number;
}

/** The amounts the buy page shipped with (#300). */
export const DEFAULT_GIFT_CARD_AMOUNT_SETTINGS: GiftCardAmountSettings = {
  presetCents: [...GIFT_CARD_PRESET_CENTS],
  minCents: GIFT_CARD_MIN_CENTS,
  maxCents: GIFT_CARD_MAX_CENTS,
};

/**
 * A class type that can be bought as a gift certificate, as the buy page
 * shows it (#309).
 */
export interface GiftCertificateClassType {
  /** The class category id. */
  id: string;
  name: string;
  /** What the certificate costs and loads onto the card, in cents. */
  priceCents: number;
  /** The type's first pool image, if it has one. */
  imageUrl?: string;
  imageAlt?: string;
}

/** The class category fields that make it a gift certificate. */
interface GiftCertificateCategoryFields {
  id: string;
  name: string;
  giftCertificateEnabled?: boolean;
  giftCertificatePriceCents?: number;
  galleryImages?: Array<{ url: string; alt: string }>;
}

/** Whether a class type is switched on and priced as a gift certificate. */
export function isGiftCertificateCategory(
  category: GiftCertificateCategoryFields | undefined
): boolean {
  const price = category?.giftCertificatePriceCents;
  return (
    category?.giftCertificateEnabled === true &&
    typeof price === 'number' &&
    Number.isInteger(price) &&
    price > 0
  );
}

/** A switched-on class type as the buy page shows it. */
export function toGiftCertificateClassType(
  category: GiftCertificateCategoryFields
): GiftCertificateClassType {
  const image = category.galleryImages?.[0];
  return {
    id: category.id,
    name: category.name,
    priceCents: category.giftCertificatePriceCents ?? 0,
    ...(image?.url ? { imageUrl: image.url, imageAlt: image.alt } : {}),
  };
}
/** Longest personal message, in characters. */
export const GIFT_CARD_MESSAGE_MAX_LENGTH = 300;

/**
 * Whether a dollar amount can be sold online: whole dollars, within the
 * limits in Settings (by default $10 to $500).
 */
export function isAllowedGiftCardAmount(
  amountCents: unknown,
  limits: Pick<GiftCardAmountSettings, 'minCents' | 'maxCents'> = DEFAULT_GIFT_CARD_AMOUNT_SETTINGS
): boolean {
  return (
    typeof amountCents === 'number' &&
    Number.isInteger(amountCents) &&
    amountCents % 100 === 0 &&
    amountCents >= limits.minCents &&
    amountCents <= limits.maxCents
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
 * "$50" or "One Pottery class at Maple & Spruce".
 *
 * A certificate is for a class type, not one class (#309), so only the type
 * is named. Its name falls back to `className`, which holds the type's name
 * on certificates bought by type.
 */
export function describeGiftCardPurchase(
  purchase: Pick<GiftCardPurchase, 'kind' | 'valueCents' | 'className'> & {
    classCategoryName?: string;
  }
): string {
  if (purchase.kind !== 'class') {
    return formatGiftCardDollars(purchase.valueCents);
  }
  const type = purchase.classCategoryName?.trim() || purchase.className?.trim();
  return type ? `One ${type} class at Maple & Spruce` : 'One class at Maple & Spruce';
}
