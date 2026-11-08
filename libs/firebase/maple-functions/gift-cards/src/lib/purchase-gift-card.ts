/**
 * `giftCards/purchaseGiftCard`: a customer buys a gift card on our own buy
 * page (#300).
 *
 * Square owns the card. The flow follows Square's "sell a gift card through
 * the Orders API" recipe:
 *
 *   1. validate the request (before any Square call)
 *   2. price it: a dollar amount, or a class's current price
 *   3. create an order with one untaxed `GIFT_CARD` line
 *   4. pay the order with the buyer's card
 *   5. create a digital gift card and activate it against that order line
 *   6. record the purchase, then email the code
 *
 * If the payment went through but the card could not be made or loaded, the
 * payment is refunded in full and the buyer is told so. Every Square key is
 * derived from the browser's idempotency key, so a retried request returns the
 * same order, payment and card instead of charging twice.
 *
 * The full card code is emailed and returned to no one else: it is never
 * logged, never stored in `giftCardPurchases`, and never sent back to the
 * browser (which only gets the last 4 digits).
 */
import { createHash } from 'crypto';
import {
  type FunctionContext,
  queueMail,
  throwInvalidArgument,
  throwValidationError,
} from '@maple/firebase/functions';
import {
  ClassCategoryRepository,
  ClassRepository,
  GiftCardPurchaseRepository,
} from '@maple/firebase/database';
import {
  PaymentError,
  Square,
  type SquareSecrets,
  type SquareStrings,
} from '@maple/firebase/square';
import {
  describeGiftCardPurchase,
  formatGiftCardCode,
  formatGiftCardDollars,
  type GiftCardPurchase,
  isClassRegistrationOpen,
  isPrivateHoursClass,
} from '@maple/ts/domain';
import type {
  PurchaseGiftCardRequest,
  PurchaseGiftCardResponse,
} from '@maple/ts/firebase/api-types';
import { giftCardPurchaseValidation } from '@maple/ts/validation';

/** The studio's phone number, for the "call us" line on a failure. */
const STUDIO_PHONE = '304-314-4506';

export type PurchaseGiftCardStrings = SquareStrings & {
  /** Where a "charged but no card and no refund" alert goes. */
  ADMIN_ALERT_EMAIL?: string;
};

/** Every Square idempotency key for one purchase, from the browser's key. */
export function giftCardPurchaseKeys(clientKey: string): {
  referenceId: string;
  order: string;
  payment: string;
  card: string;
  activate: string;
  refund: string;
} {
  // Hashed so the keys stay within Square's 45-character payment/refund limit
  // whatever the browser sends, and do not echo the browser's value.
  const h = createHash('sha256').update(clientKey).digest('hex').slice(0, 32);
  return {
    // Square caps reference_id at 40 characters.
    referenceId: `giftcard-${h.slice(0, 24)}`,
    order: `gco-${h}`,
    payment: `gcp-${h}`,
    card: `gcc-${h}`,
    activate: `gca-${h}`,
    refund: `gcr-${h}`,
  };
}

interface Priced {
  valueCents: number;
  lineItemName: string;
  classId?: string;
  classCategoryId?: string;
  classCategoryName?: string;
  className?: string;
}

/** What the card is worth and what it is called on the Square order. */
async function priceRequest(data: PurchaseGiftCardRequest): Promise<Priced> {
  if (data.kind === 'amount') {
    return { valueCents: data.amountCents, lineItemName: 'Gift card' };
  }

  const classEntity = await ClassRepository.findById(data.classId);
  if (!classEntity || !isClassRegistrationOpen(classEntity)) {
    throwInvalidArgument('That class is not available for a gift certificate.');
  }
  if (isPrivateHoursClass(classEntity)) {
    throwInvalidArgument(
      'A private-hours class cannot be bought as a gift certificate. Choose a dollar amount instead.'
    );
  }
  if (!classEntity.categoryId || classEntity.priceCents <= 0) {
    throwInvalidArgument('That class is not available for a gift certificate.');
  }

  let classCategoryName: string | undefined;
  try {
    classCategoryName = (await ClassCategoryRepository.findById(classEntity.categoryId))
      ?.name;
  } catch (error) {
    // The type's name only decorates the email; never fail a sale over it.
    console.error('[purchaseGiftCard] could not read class category', error);
  }

  return {
    valueCents: classEntity.priceCents,
    lineItemName: `Gift card: ${classEntity.name}`,
    classId: classEntity.id,
    classCategoryId: classEntity.categoryId,
    classCategoryName,
    className: classEntity.name,
  };
}

function trimmed(value: string | undefined): string | undefined {
  const t = value?.trim();
  return t ? t : undefined;
}

export async function purchaseGiftCard(
  data: PurchaseGiftCardRequest,
  _context: FunctionContext,
  secrets: SquareSecrets,
  strings: PurchaseGiftCardStrings
): Promise<PurchaseGiftCardResponse> {
  // 1. Validate before anything touches Square.
  const validation = giftCardPurchaseValidation(data ?? {});
  if (validation.hasErrors()) throwValidationError(validation.getErrors());

  const buyerName = data.buyerName.trim();
  const buyerEmail = data.buyerEmail.trim();
  const recipientName = trimmed(data.recipientName);
  const recipientEmail = trimmed(data.recipientEmail);
  const message = trimmed(data.message);
  const deliverTo = data.deliverTo;
  const sendTo = deliverTo === 'recipient' && recipientEmail ? recipientEmail : buyerEmail;

  // 2. Price it.
  const priced = await priceRequest(data);
  const keys = giftCardPurchaseKeys(data.idempotencyKey);
  const square = new Square(secrets, strings);
  const locationId = square.locationId;
  const logBase = {
    referenceId: keys.referenceId,
    kind: data.kind,
    valueCents: priced.valueCents,
  };

  // 3. The order: one gift card line, no tax (a gift card is not taxed when
  // sold; tax applies when it is spent).
  const order = await square.ordersService.createOrder({
    locationId,
    idempotencyKey: keys.order,
    referenceId: keys.referenceId,
    lineItems: [
      {
        name: priced.lineItemName,
        quantity: '1',
        basePriceCents: priced.valueCents,
        itemType: 'GIFT_CARD',
      },
    ],
    taxes: [],
  });
  const lineItemUid =
    order.lineItems.find((line) => line.itemType === 'GIFT_CARD')?.uid ??
    order.lineItems[0]?.uid;
  if (!lineItemUid || order.totalCents !== priced.valueCents) {
    // Nothing has been charged yet, so this is safe to fail outright.
    console.error(
      JSON.stringify({
        event: 'gift_card_order_unexpected',
        ...logBase,
        orderId: order.orderId,
        orderTotalCents: order.totalCents,
        hasLineItemUid: Boolean(lineItemUid),
      })
    );
    throw new Error('We could not start your purchase. Please try again.');
  }

  // 4. Pay for it.
  let paymentId: string;
  try {
    const payment = await square.paymentsService.createPayment({
      sourceId: data.sourceId,
      amountCents: order.totalCents,
      idempotencyKey: keys.payment,
      locationId,
      buyerEmailAddress: buyerEmail,
      note: `Gift card bought online (${describeGiftCardPurchase({
        kind: data.kind,
        valueCents: priced.valueCents,
        className: priced.className,
      })})`.slice(0, 500),
      referenceId: keys.referenceId,
      orderId: order.orderId,
    });
    paymentId = payment.paymentId;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'gift_card_payment_failed',
        ...logBase,
        orderId: order.orderId,
        squareErrorCode: error instanceof PaymentError ? error.squareErrorCode : undefined,
        error: error instanceof Error ? error.message : String(error),
      })
    );
    if (error instanceof PaymentError) throw error;
    throw new PaymentError(
      'Unable to process payment. Please try again or use a different card.'
    );
  }

  // 5. Make the card and put the money on it. If either step fails the buyer
  // has paid for nothing, so the payment is refunded.
  let card: { id: string; gan: string; last4: string };
  try {
    card = await square.giftCardsService.createDigitalGiftCard({
      locationId,
      idempotencyKey: keys.card,
    });
    await square.giftCardsService.activateGiftCard({
      giftCardId: card.id,
      locationId,
      orderId: order.orderId,
      lineItemUid,
      idempotencyKey: keys.activate,
    });
  } catch (error) {
    await refundAfterCardFailure({
      square,
      paymentId,
      orderId: order.orderId,
      keys,
      logBase,
      cause: error,
      buyerEmail,
      adminAlertEmail: strings.ADMIN_ALERT_EMAIL,
    });
    throw new Error(
      `We could not create your gift card, so we refunded your payment. Please try again, or call us at ${STUDIO_PHONE}.`,
      { cause: error }
    );
  }

  const response: PurchaseGiftCardResponse = {
    giftCardId: card.id,
    last4: card.last4,
    kind: data.kind,
    valueCents: priced.valueCents,
    className: priced.className,
    deliverTo,
    sentTo: sendTo,
  };

  // A retry of a purchase that already finished: Square handed back the same
  // card, and its emails have already gone out.
  try {
    if (await GiftCardPurchaseRepository.findByGiftCardId(card.id)) {
      console.log(
        JSON.stringify({ event: 'gift_card_purchase_retried', ...logBase, giftCardId: card.id })
      );
      return response;
    }
  } catch (error) {
    console.error('[purchaseGiftCard] could not check for an earlier record', error);
  }

  // 6. Record it. The card is paid for and live by now, so nothing below may
  // fail the sale: a lost record or email is logged for a person to fix.
  const purchase: Omit<GiftCardPurchase, 'createdAt'> = {
    giftCardId: card.id,
    last4: card.last4,
    kind: data.kind,
    valueCents: priced.valueCents,
    classId: priced.classId,
    classCategoryId: priced.classCategoryId,
    className: priced.className,
    buyerName,
    buyerEmail,
    recipientName,
    recipientEmail,
    message,
    deliverTo,
    squareOrderId: order.orderId,
    squarePaymentId: paymentId,
  };
  try {
    await GiftCardPurchaseRepository.create(purchase);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'gift_card_purchase_record_failed',
        ...logBase,
        giftCardId: card.id,
        error: error instanceof Error ? error.message : String(error),
      })
    );
  }

  await sendGiftCardEmails({
    purchase,
    code: card.gan,
    classCategoryName: priced.classCategoryName,
    sendTo,
  });

  console.log(
    JSON.stringify({
      event: 'gift_card_purchased',
      ...logBase,
      giftCardId: card.id,
      orderId: order.orderId,
      paymentId,
      deliverTo,
    })
  );
  return response;
}

async function refundAfterCardFailure(input: {
  square: Square;
  paymentId: string;
  orderId: string;
  keys: ReturnType<typeof giftCardPurchaseKeys>;
  logBase: Record<string, unknown>;
  cause: unknown;
  buyerEmail: string;
  adminAlertEmail: string | undefined;
}): Promise<void> {
  const { square, paymentId, orderId, keys, logBase, cause } = input;
  const amountCents = Number(logBase['valueCents']);
  const causeMessage = cause instanceof Error ? cause.message : String(cause);
  try {
    const refund = await square.paymentsService.refundPayment({
      paymentId,
      amountCents,
      idempotencyKey: keys.refund,
      reason: 'Gift card could not be created',
    });
    console.error(
      JSON.stringify({
        event: 'gift_card_purchase_refunded',
        ...logBase,
        orderId,
        paymentId,
        refundId: refund.refundId,
        refundStatus: refund.status,
        error: causeMessage,
      })
    );
  } catch (refundError) {
    // The worst case: charged, no card, no refund. A person has to act.
    console.error(
      JSON.stringify({
        event: 'gift_card_refund_failed',
        ...logBase,
        orderId,
        paymentId,
        error: causeMessage,
        refundError: refundError instanceof Error ? refundError.message : String(refundError),
      })
    );
    if (input.adminAlertEmail) {
      try {
        await queueMail({
          to: input.adminAlertEmail,
          templateName: 'gift-card-refund-needed',
          sender: 'maple-spruce',
          data: {
            amount: formatGiftCardDollars(amountCents),
            buyerEmail: input.buyerEmail,
            squarePaymentId: paymentId,
            squareOrderId: orderId,
          },
        });
      } catch (mailError) {
        console.error('[purchaseGiftCard] could not queue the refund alert', mailError);
      }
    }
  }
}

/**
 * The gift email goes to whoever `deliverTo` names. When that is the
 * recipient, the buyer also gets a confirmation that shows only the last 4.
 */
async function sendGiftCardEmails(input: {
  purchase: Omit<GiftCardPurchase, 'createdAt'>;
  code: string;
  classCategoryName?: string;
  sendTo: string;
}): Promise<void> {
  const { purchase, code, classCategoryName, sendTo } = input;
  const description = describeGiftCardPurchase({ ...purchase, classCategoryName });
  const toRecipient = purchase.deliverTo === 'recipient';

  try {
    await queueMail({
      to: sendTo,
      templateName: 'gift-card',
      sender: 'maple-spruce',
      data: {
        recipientName: toRecipient ? purchase.recipientName : undefined,
        forBuyer: !toRecipient,
        buyerName: purchase.buyerName,
        giftFor: !toRecipient ? purchase.recipientName : undefined,
        description,
        isClass: purchase.kind === 'class',
        code: formatGiftCardCode(code),
        message: purchase.message,
      },
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'gift_card_email_failed',
        giftCardId: purchase.giftCardId,
        error: error instanceof Error ? error.message : String(error),
      })
    );
  }

  if (!toRecipient) return;
  try {
    await queueMail({
      to: purchase.buyerEmail,
      templateName: 'gift-card-purchase-confirmation',
      sender: 'maple-spruce',
      data: {
        buyerName: purchase.buyerName,
        recipientName: purchase.recipientName,
        recipientEmail: purchase.recipientEmail,
        description,
        last4: purchase.last4,
        message: purchase.message,
      },
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'gift_card_confirmation_email_failed',
        giftCardId: purchase.giftCardId,
        error: error instanceof Error ? error.message : String(error),
      })
    );
  }
}
