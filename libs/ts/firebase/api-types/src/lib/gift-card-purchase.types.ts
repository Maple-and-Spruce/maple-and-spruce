/**
 * Buying a gift card on our own buy page (#300): `giftCards/purchaseGiftCard`.
 */
import type {
  GiftCardDeliverTo,
  GiftCardPurchase,
  GiftCardPurchaseKind,
} from '@maple/ts/domain';

interface PurchaseGiftCardBase {
  buyerName: string;
  buyerEmail: string;
  recipientName?: string;
  /** Required when `deliverTo` is `recipient`. */
  recipientEmail?: string;
  /** Up to 300 characters, printed in the gift email. */
  message?: string;
  /** Who gets the email with the code. */
  deliverTo: GiftCardDeliverTo;
  /** Square Web Payments SDK card nonce. */
  sourceId: string;
  /**
   * Made by the browser once per attempt. Every Square key is derived from it,
   * so a retried request cannot charge twice or make a second card.
   */
  idempotencyKey: string;
}

export type PurchaseGiftCardRequest =
  | (PurchaseGiftCardBase & { kind: 'amount'; amountCents: number })
  | (PurchaseGiftCardBase & { kind: 'class'; classId: string });

export interface PurchaseGiftCardResponse {
  /** Square gift card id. */
  giftCardId: string;
  /** Last 4 digits of the code; the full code only goes out by email. */
  last4: string;
  kind: GiftCardPurchaseKind;
  /** What was charged and put on the card, in cents. */
  valueCents: number;
  /** For a class certificate, the class's name. */
  className?: string;
  /** Who the email with the code went to. */
  deliverTo: GiftCardDeliverTo;
  /** The address the email with the code went to. */
  sentTo: string;
}

/** A purchase record as the admin reads it (dates as ISO strings). */
export type GiftCardPurchaseDetails = Omit<GiftCardPurchase, 'createdAt'> & {
  createdAt: string;
  /** For a class certificate, the class type's name. */
  classCategoryName?: string;
};
