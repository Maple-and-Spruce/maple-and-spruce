/**
 * Refund a gift card bought online, or turn any card off. Admin only.
 *
 * Two modes:
 *
 *   - `refund`, for a card bought on our own buy page (a record with the
 *     Square payment). What is left on the card goes back to the card that
 *     paid for it, and the card is left at $0. It is not turned off: Square
 *     lets an app turn a card off only as "suspicious activity", and a $0
 *     card cannot be spent anyway. A refund in the Square Dashboard does the
 *     same.
 *   - `deactivate`, for any card. What is left on it is taken off and the
 *     card is turned off. No money is returned by us: a card sold at the
 *     register is refunded at the register or in the Square Dashboard.
 *
 * A card that was partly spent is refunded only what is left on it: that is
 * the buyer's money still unspent; what was spent paid for something. A card
 * holding more than was paid online (topped up at the register) is refused,
 * so a top-up is never taken off without being returned.
 *
 * The steps, in the order that keeps the money safe:
 *
 *   1. Record the closure on the card's record (`closure`), with the amount,
 *      before any money moves. A second click or a retry finds it and uses the
 *      same amount, even after the card is empty.
 *   2. Take what is left off the card (`ADJUST_DECREMENT`). From here nobody
 *      can spend it.
 *   3. Refund mode: refund that amount on the original payment.
 *   4. Deactivate mode: turn the card off (`DEACTIVATE`).
 *
 * The balance comes off the card before any refund, so **a failure never
 * leaves the money both refunded and spendable**. A failure at each step
 * leaves:
 *
 *   - 1 or 2: the money on the card, as before. Try again.
 *   - 3: the money off the card and not yet refunded. It is not lost: the
 *     record holds the amount and the card's Square history shows it coming
 *     off; trying again makes the refund.
 *   - 4: the card holding $0 but not turned off. Nothing can be spent from
 *     it; trying again turns it off.
 *
 * Every Square call uses a key derived from the card, so a retried call
 * returns Square's first answer instead of moving money twice. Step 2 is also
 * skipped when the card's history already shows it, and step 3 when the
 * closure already holds Square's refund id.
 *
 * Logs `gift_card_closed {giftCardId, mode, amountCents, refundedCents, uid}`,
 * never a code.
 */
import { createHash } from 'crypto';
import {
  type FunctionContext,
  throwFailedPrecondition,
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import { GiftCardPurchaseRepository } from '@maple/firebase/database';
import {
  Square,
  type SquareSecrets,
  type SquareStrings,
} from '@maple/firebase/square';
import {
  formatGiftCardDollars,
  type GiftCardClosure,
  giftCardStateLabel,
  isRefundableOnline,
  redactGiftCertificateCodes,
} from '@maple/ts/domain';
import type {
  CloseGiftCardRequest,
  CloseGiftCardResponse,
} from '@maple/ts/firebase/api-types';
import { balanceAlreadyTakenOff } from './replace-gift-card';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

/** Square keys, from the card: one card is closed once. Square caps keys at 45 characters. */
export function closeGiftCardKeys(giftCardId: string) {
  const card = sha(giftCardId).slice(0, 24);
  return {
    decrement: (amountCents: number) => `gc-close-dec-${card}-${amountCents}`,
    refund: `gc-close-refund-${card}`,
    deactivate: `gc-close-deact-${card}`,
  };
}

function errorText(error: unknown): string {
  return redactGiftCertificateCodes(error instanceof Error ? error.message : String(error));
}

export async function closeGiftCard(
  data: CloseGiftCardRequest,
  context: FunctionContext,
  secrets: SquareSecrets,
  strings: SquareStrings
): Promise<CloseGiftCardResponse> {
  const giftCardId = typeof data?.giftCardId === 'string' ? data.giftCardId.trim() : '';
  const mode = data?.mode;
  if (!giftCardId) throwInvalidArgument('Gift card id is required');
  if (mode !== 'refund' && mode !== 'deactivate') {
    throwInvalidArgument('Choose refund or deactivate');
  }

  const square = new Square(secrets, strings);
  const giftCards = square.giftCardsService;
  const keys = closeGiftCardKeys(giftCardId);
  const logBase = { giftCardId, mode, uid: context.uid ?? null };
  const fail = (step: string, error: unknown) =>
    console.error(
      JSON.stringify({ event: 'gift_card_close_failed', ...logBase, step, error: errorText(error) })
    );

  const card = await giftCards.getGiftCard(giftCardId);
  if (!card) throwNotFound('Gift card', giftCardId);
  const record = await GiftCardPurchaseRepository.findByGiftCardId(giftCardId);

  if (mode === 'refund' && !isRefundableOnline(record)) {
    throwFailedPrecondition(
      'Only a card bought on the website can be refunded here. Turn this one off instead, and refund it in Square if it was paid for.'
    );
  }
  if (record?.closure?.completedAt && record.closure.kind === 'refund') {
    throwFailedPrecondition('This card was already refunded. It holds $0, so nothing can be spent from it.');
  }
  if (record?.closure && record.closure.kind !== mode) {
    throwFailedPrecondition(
      record.closure.kind === 'refund'
        ? 'A refund of this card was already started. Choose Refund to finish it.'
        : 'This card was already being turned off without a refund. Choose Turn off to finish it.'
    );
  }

  // Step 1: the closure, or the one an earlier try started.
  let closure: GiftCardClosure | undefined = record?.closure;
  if (!closure) {
    if (card.state === 'deactivated') {
      throwFailedPrecondition('This card is already turned off.');
    }
    if (card.state === 'pending') {
      throwFailedPrecondition(
        'This card has not been sold yet, so it holds nothing. A printed certificate that was never sold can be thrown away.'
      );
    }
    const amountCents = Math.max(0, card.balanceCents);
    if (mode === 'refund') {
      if (amountCents <= 0) {
        throwFailedPrecondition(
          'Nothing is left on this card, so there is nothing to refund. Turn it off instead.'
        );
      }
      if (record && amountCents > record.valueCents) {
        throwFailedPrecondition(
          `This card holds ${formatGiftCardDollars(amountCents)}, more than the ${formatGiftCardDollars(record.valueCents)} paid online, so it was topped up at the register. Refund the top-up in Square first, then refund here.`
        );
      }
    }
    const started: GiftCardClosure = {
      kind: mode,
      amountCents,
      startedAt: new Date().toISOString(),
      byUid: context.uid,
    };
    closure = record
      ? await GiftCardPurchaseRepository.startClosure(giftCardId, started)
      : started;
  }
  const amountCents = closure.amountCents;

  // Step 2: take what is left off the card.
  if (amountCents > 0) {
    const history = await giftCards.listCardHistory(giftCardId, card.createdAt);
    if (!balanceAlreadyTakenOff(history, amountCents, new Date(closure.startedAt))) {
      try {
        await giftCards.adjustDecrement({
          giftCardId,
          locationId: square.locationId,
          amountCents,
          idempotencyKey: keys.decrement(amountCents),
          reason: mode === 'refund' ? 'PURCHASE_WAS_REFUNDED' : 'SUPPORT_ISSUE',
        });
      } catch (error) {
        fail('decrement', error);
        throw new Error(
          `Square could not take the money off the card, so nothing was refunded and the card still holds it. Try again. (${errorText(error)})`,
          { cause: error }
        );
      }
    }
  }

  // Step 3: refund it.
  let refundedCents = 0;
  if (mode === 'refund' && amountCents > 0 && closure.squareRefundId) {
    // An earlier try made the refund and stopped before recording it done.
    refundedCents = amountCents;
  } else if (mode === 'refund' && amountCents > 0 && record?.squarePaymentId) {
    try {
      const refund = await square.paymentsService.refundPayment({
        paymentId: record.squarePaymentId,
        amountCents,
        idempotencyKey: keys.refund,
        reason: 'Gift card refunded and turned off',
      });
      refundedCents = amountCents;
      if (refund.refundId !== closure.squareRefundId) {
        await GiftCardPurchaseRepository.updateClosure(giftCardId, {
          squareRefundId: refund.refundId,
        });
      }
    } catch (error) {
      fail('refund', error);
      throw new Error(
        `The ${formatGiftCardDollars(amountCents)} is off the card, but Square did not make the refund yet. Nothing is lost: try again and it will finish. (${errorText(error)})`,
        { cause: error }
      );
    }
  }

  // Step 4: turn the card off. Not on a refund: see the top of this file.
  const response: CloseGiftCardResponse = { giftCardId, mode, amountCents, refundedCents };
  const now = mode === 'deactivate' ? await giftCards.getGiftCard(giftCardId) : undefined;
  if (now && now.state !== 'deactivated') {
    try {
      await giftCards.deactivate({
        giftCardId,
        locationId: square.locationId,
        idempotencyKey: keys.deactivate,
      });
    } catch (error) {
      fail('deactivate', error);
      response.warning = `Square did not turn the card off. It holds nothing, so nothing can be spent from it. Try again to turn it off. (It is ${giftCardStateLabel(now.state).toLowerCase()}.)`;
    }
  }
  if (!response.warning && record) {
    await GiftCardPurchaseRepository.updateClosure(giftCardId, {
      completedAt: new Date().toISOString(),
    }).catch((error: unknown) => fail('record-complete', error));
  }

  console.log(
    JSON.stringify({
      event: 'gift_card_closed',
      ...logBase,
      amountCents,
      refundedCents,
      ...(response.warning ? { stillOn: true } : {}),
    })
  );
  return response;
}
