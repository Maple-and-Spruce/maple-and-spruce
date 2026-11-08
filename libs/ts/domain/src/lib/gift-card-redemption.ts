/**
 * Paying for a class with a gift card (#301).
 *
 * Pure rules shared by the checkout preview and `createRegistration`, so what
 * a family is shown and what Square is asked to charge come from one place.
 * The server always re-reads the card from Square; these helpers never trust
 * an amount from the browser.
 */
import { calculateTax } from './tax';
import type { GiftCardState, GiftCardSummary } from './gift-card';

/**
 * Why a gift card cannot be used, in words a family understands. Undefined
 * when the card can pay.
 */
export function giftCardRejectionMessage(
  card: Pick<GiftCardSummary, 'state' | 'balanceCents'> | undefined
): string | undefined {
  if (!card) {
    return "We couldn't find that gift card. Please check the number and try again.";
  }
  const notActive: Partial<Record<GiftCardState, string>> = {
    pending:
      "This gift card hasn't been turned on yet. Please contact us and we'll sort it out.",
    deactivated:
      'This gift card has been turned off. Please contact us if you think that is a mistake.',
    blocked:
      'This gift card is on hold. Please contact us and we will sort it out.',
  };
  if (card.state !== 'active') {
    return notActive[card.state] ?? 'This gift card cannot be used right now.';
  }
  if (card.balanceCents <= 0) {
    return 'This gift card has no money left on it.';
  }
  return undefined;
}

/**
 * The class price a class certificate is measured against: one seat (or one
 * private hour) after any discount code. A certificate is bought for one
 * class, so extra seats on the same order are the family's to pay.
 */
export function certificateClassPriceCents(input: {
  /** The class's price per seat (or per hour). */
  unitPriceCents: number;
  /** The whole order after any discount code, before tax. */
  subtotalCents: number;
}): number {
  return Math.max(0, Math.min(input.unitPriceCents, input.subtotalCents));
}

export interface GiftCardSplit {
  /** What the class certificate covers, before tax, in cents. */
  classCertificateCoverCents: number;
  /** The order's subtotal after the certificate cover, before tax. */
  subtotalAfterCoverCents: number;
  /** Tax on the subtotal after the cover. */
  taxAmountCents: number;
  /** What is owed in all, tax included, after the cover. */
  totalCents: number;
  /** What comes off the gift card. */
  giftCardAmountCents: number;
  /** What is left for a card. Zero when the gift card covers it all. */
  leftToPayCents: number;
}

/**
 * How an order is split between a gift card and a card.
 *
 * The certificate cover is a pre-tax discount (as a discount code is), so tax
 * is charged on what is left after it. The gift card then pays as much of the
 * total as its balance allows, and a card pays the rest.
 */
export function splitGiftCardPayment(input: {
  /** The order after any discount code, before tax. */
  subtotalCents: number;
  taxRatePercent: number;
  balanceCents: number;
  classCertificateCoverCents: number;
}): GiftCardSplit {
  const cover = Math.max(
    0,
    Math.min(input.classCertificateCoverCents, input.subtotalCents)
  );
  const subtotalAfterCoverCents = input.subtotalCents - cover;
  const { taxAmountCents, totalCents } = calculateTax(
    subtotalAfterCoverCents,
    input.taxRatePercent
  );
  const giftCardAmountCents = Math.min(
    Math.max(0, input.balanceCents),
    totalCents
  );
  return {
    classCertificateCoverCents: cover,
    subtotalAfterCoverCents,
    taxAmountCents,
    totalCents,
    giftCardAmountCents,
    leftToPayCents: totalCents - giftCardAmountCents,
  };
}

/** A registration's payments, as `cancelRegistration` must refund them. */
export interface RegistrationRefundPart {
  paymentId: string;
  amountCents: number;
  kind: 'card' | 'gift-card';
}

/**
 * Each Square payment behind a registration and how much went through it.
 *
 * A registration paid without a gift card has one payment for the whole
 * amount, exactly as before. One paid partly by gift card has two, and each
 * is refunded to where it came from: the card's share to the card, the gift
 * card's share back onto the gift card. The studio-covered class certificate
 * amount was never paid by anyone, so it is never refunded.
 */
export function registrationRefundParts(registration: {
  pricePaidCents: number;
  squarePaymentId?: string;
  squareGiftCardPaymentId?: string;
  giftCardPaidCents?: number;
  cardPaidCents?: number;
}): RegistrationRefundPart[] {
  const {
    pricePaidCents,
    squarePaymentId,
    squareGiftCardPaymentId,
    giftCardPaidCents,
    cardPaidCents,
  } = registration;

  if (!squareGiftCardPaymentId) {
    return squarePaymentId
      ? [{ paymentId: squarePaymentId, amountCents: pricePaidCents, kind: 'card' }]
      : [];
  }

  const parts: RegistrationRefundPart[] = [];
  if (
    squarePaymentId &&
    squarePaymentId !== squareGiftCardPaymentId &&
    (cardPaidCents ?? 0) > 0
  ) {
    parts.push({
      paymentId: squarePaymentId,
      amountCents: cardPaidCents ?? 0,
      kind: 'card',
    });
  }
  const giftShare = giftCardPaidCents ?? pricePaidCents - (cardPaidCents ?? 0);
  if (giftShare > 0) {
    parts.push({
      paymentId: squareGiftCardPaymentId,
      amountCents: giftShare,
      kind: 'gift-card',
    });
  }
  return parts;
}

/** "$60.00" from 6000. */
export function formatCentsAsDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
