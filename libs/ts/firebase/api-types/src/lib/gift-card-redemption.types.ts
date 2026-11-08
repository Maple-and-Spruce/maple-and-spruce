/**
 * Paying for a class with a gift card (#301).
 */

/**
 * Preview what a gift card would pay toward a class, before the family pays.
 * Public: the widget calls it when someone presses Apply on the gift card
 * field. The server reads the card from Square; nothing here is charged.
 */
export interface PreviewGiftCardForClassRequest {
  /** Token from the Web Payments SDK gift card field (`giftCard.tokenize()`). */
  giftCardNonce: string;
  classId: string;
  /** Seats being booked, exactly as the checkout will send them. */
  quantity: number;
  /** The discount code the checkout will send, if any. */
  discountCode?: string;
}

export interface PreviewGiftCardForClassResponse {
  /** Last 4 digits of the card number. */
  last4: string;
  /** What is on the card now, in cents. */
  balanceCents: number;
  /** What the studio covers when the card is a class certificate for this kind of class. */
  classCertificateCoverCents: number;
  /** The order after any discount code, before the cover and tax. */
  subtotalCents: number;
  /** Tax after the cover. */
  taxAmountCents: number;
  /** The total after the cover, tax included. */
  totalCents: number;
  /** What would come off the gift card. */
  giftCardAmountCents: number;
  /** What is left for a card; zero when the gift card covers it all. */
  leftToPayCents: number;
}
