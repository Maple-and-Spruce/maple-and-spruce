/**
 * Paying for a class with a gift card (#301).
 *
 * Square owns every gift card. The browser sends only a token from the Web
 * Payments SDK gift card field; the server reads the card (and its balance)
 * back from Square and never takes an amount from the browser.
 *
 * Money moves the way Square's split-tender walkthrough describes:
 *   1. one Square order for the class, with the class certificate cover (if
 *      any) as a pre-tax discount named "Class certificate",
 *   2. a gift card payment, authorized only (`autocomplete: false`,
 *      `accept_partial_authorization: true`), for as much as the card holds,
 *   3. when the gift card does not cover it all, a card payment for the rest,
 *      also authorized only,
 *   4. `orders.pay` with both payment ids, which completes them together.
 * Until step 4 nothing has been taken. Any failure before it cancels every
 * payment already authorized, so a declined card never costs a family their
 * gift card balance.
 *
 * @see https://developer.squareup.com/docs/web-payments/gift-card-walkthrough
 */
import { GiftCardPurchaseRepository } from '@maple/firebase/database';
import { PaymentError, type Square } from '@maple/firebase/square';
import {
  certificateClassPriceCents,
  classCertificateCushionCents,
  giftCardRejectionMessage,
  type Class,
  type GiftCardPurchase,
  type GiftCardSummary,
} from '@maple/ts/domain';

/** The name of the studio-covered discount on the Square order. */
export const CLASS_CERTIFICATE_DISCOUNT_NAME = 'Class certificate';

/** A gift card that can pay, with its purchase record if we sold it. */
export interface UsableGiftCard {
  card: GiftCardSummary;
  purchase?: GiftCardPurchase;
}

/**
 * Read the card behind a gift card token and check it can pay. Throws an
 * Error with a plain-language message for an unknown, inactive or empty card.
 */
export async function readUsableGiftCard(
  square: Pick<Square, 'giftCardsService'>,
  giftCardNonce: string
): Promise<UsableGiftCard> {
  if (!giftCardNonce?.trim()) {
    throw new Error('Gift card is required');
  }
  const card = await square.giftCardsService.getGiftCardFromNonce(giftCardNonce);
  const rejection = giftCardRejectionMessage(card);
  if (rejection || !card) {
    throw new Error(rejection);
  }
  const purchase = await GiftCardPurchaseRepository.findByGiftCardId(card.id);
  return { card, purchase };
}

/**
 * What the studio covers when this card is a class certificate for a class of
 * this kind. Measured against one seat after any discount code.
 */
export function classCertificateCoverCents(input: {
  giftCard: UsableGiftCard;
  classEntity: Pick<Class, 'categoryId' | 'priceCents'>;
  /** The order after any discount code, before tax. */
  subtotalCents: number;
}): number {
  const { giftCard, classEntity, subtotalCents } = input;
  return classCertificateCushionCents({
    purchase: giftCard.purchase,
    classCategoryId: classEntity.categoryId,
    classPriceCents: certificateClassPriceCents({
      unitPriceCents: classEntity.priceCents,
      subtotalCents,
    }),
    balanceCents: giftCard.card.balanceCents,
  });
}

/** Idempotency keys for one registration's gift card payment. Square caps them at 45 characters. */
export function giftCardIdempotencyKeys(registrationId: string): {
  order: string;
  giftCardPayment: string;
  cardPayment: string;
  payOrder: string;
} {
  return {
    order: `gco-${registrationId}`,
    giftCardPayment: `gcp-${registrationId}`,
    cardPayment: `gcc-${registrationId}`,
    payOrder: `gpo-${registrationId}`,
  };
}

export interface GiftCardChargeInput {
  square: Pick<Square, 'paymentsService' | 'ordersService' | 'locationId'>;
  registrationId: string;
  orderId: string;
  /** The Square order's total, tax included (from Square, never the browser). */
  orderTotalCents: number;
  giftCard: UsableGiftCard;
  giftCardNonce: string;
  /** Card token for whatever the gift card does not cover. May be empty. */
  cardNonce?: string;
  buyerEmailAddress: string;
  note: string;
}

export interface GiftCardCharge {
  giftCardPaymentId: string;
  giftCardPaidCents: number;
  cardPaymentId?: string;
  cardPaidCents: number;
  receiptUrl?: string;
}

const NEEDS_CARD_MESSAGE =
  'Your gift card does not cover the whole amount. Please enter a card for the rest.';

/**
 * Take the gift card payment, and a card payment for any remainder, on one
 * order. Cancels whatever was authorized when anything fails, then rethrows
 * the failure (a `PaymentError` with the family-facing message where Square
 * gave one).
 */
export async function chargeWithGiftCard(
  input: GiftCardChargeInput
): Promise<GiftCardCharge> {
  const { square, registrationId, orderId, orderTotalCents, giftCard } = input;
  const keys = giftCardIdempotencyKeys(registrationId);
  const cardNonce = input.cardNonce?.trim() || undefined;

  const askGiftCardCents = Math.min(giftCard.card.balanceCents, orderTotalCents);
  if (askGiftCardCents <= 0) {
    throw new PaymentError('This gift card has no money left on it.');
  }
  // Refuse before authorizing anything when a card is plainly needed.
  if (orderTotalCents - askGiftCardCents > 0 && !cardNonce) {
    throw new PaymentError(NEEDS_CARD_MESSAGE);
  }

  // 1. The gift card, authorized only.
  let giftPayment;
  try {
    giftPayment = await square.paymentsService.createPayment({
      sourceId: input.giftCardNonce,
      amountCents: askGiftCardCents,
      idempotencyKey: keys.giftCardPayment,
      locationId: square.locationId,
      buyerEmailAddress: input.buyerEmailAddress,
      note: input.note,
      referenceId: registrationId,
      orderId,
      autocomplete: false,
      acceptPartialAuthorization: true,
    });
  } catch (error) {
    // A timeout leaves it unknown whether Square took the authorization.
    // Cancelling by the key voids it if it exists, and is harmless if not.
    await bestEffort('cancel gift card payment by key', () =>
      square.paymentsService.cancelPaymentByIdempotencyKey(keys.giftCardPayment)
    );
    throw error;
  }

  const authorized: string[] = [giftPayment.paymentId];
  const voidAuthorized = async (): Promise<void> => {
    for (const paymentId of authorized) {
      await bestEffort(`cancel payment ${paymentId}`, () =>
        square.paymentsService.cancelPayment(paymentId)
      );
    }
  };

  try {
    const giftCardPaidCents = giftPayment.amountCents;
    const leftCents = orderTotalCents - giftCardPaidCents;

    // 2. The rest on a card.
    let cardPayment;
    if (leftCents > 0) {
      if (!cardNonce) throw new PaymentError(NEEDS_CARD_MESSAGE);
      try {
        cardPayment = await square.paymentsService.createPayment({
          sourceId: cardNonce,
          amountCents: leftCents,
          idempotencyKey: keys.cardPayment,
          locationId: square.locationId,
          buyerEmailAddress: input.buyerEmailAddress,
          note: input.note,
          referenceId: registrationId,
          orderId,
          autocomplete: false,
        });
      } catch (error) {
        await bestEffort('cancel card payment by key', () =>
          square.paymentsService.cancelPaymentByIdempotencyKey(keys.cardPayment)
        );
        throw error;
      }
      authorized.push(cardPayment.paymentId);
    }

    // 3. Complete both together.
    await square.ordersService.payOrder({
      orderId,
      paymentIds: authorized,
      idempotencyKey: keys.payOrder,
    });

    return {
      giftCardPaymentId: giftPayment.paymentId,
      giftCardPaidCents,
      cardPaymentId: cardPayment?.paymentId,
      cardPaidCents: cardPayment ? leftCents : 0,
      receiptUrl: cardPayment?.receiptUrl ?? giftPayment.receiptUrl,
    };
  } catch (error) {
    await voidAuthorized();
    throw error;
  }
}

/** Run a clean-up step; log and swallow its failure so the original error wins. */
async function bestEffort(what: string, step: () => Promise<unknown>): Promise<void> {
  try {
    await step();
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'gift_card_cleanup_failed',
        step: what,
        message: error instanceof Error ? error.message : String(error),
      })
    );
  }
}
