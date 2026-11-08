/**
 * Gift card purchase analytics (#300).
 *
 * The same Meta Pixel + GA4 events the class registration widget fires
 * (`class-analytics.ts`), with the item named "Gift card", so a gift card sale
 * shows up in the same funnel reports and Meta conversions. Reusing those
 * trackers keeps the Maple & Spruce pixel scoping (`trackSingle`) in one place.
 *
 * The item id is a fixed `gift-card`, not a class id: a gift card is not in
 * the class catalog feed, and a class certificate is still a gift card sale.
 */
import { trackAddClassToCart, trackPurchaseClass } from './class-analytics';

export const GIFT_CARD_ITEM_ID = 'gift-card';
export const GIFT_CARD_ITEM_NAME = 'Gift card';

export function trackAddGiftCardToCart(
  win: unknown,
  input: { valueCents: number }
): void {
  if (!Number.isFinite(input.valueCents)) return;
  trackAddClassToCart(win, {
    classId: GIFT_CARD_ITEM_ID,
    className: GIFT_CARD_ITEM_NAME,
    priceCents: input.valueCents,
    quantity: 1,
  });
}

export function trackPurchaseGiftCard(
  win: unknown,
  input: { valueCents: number; transactionId: string }
): void {
  trackPurchaseClass(win, {
    classId: GIFT_CARD_ITEM_ID,
    className: GIFT_CARD_ITEM_NAME,
    pricePaidCents: input.valueCents,
    quantity: 1,
    // Square's gift card id: unique per sale, and not the code.
    confirmationNumber: input.transactionId,
  });
}
