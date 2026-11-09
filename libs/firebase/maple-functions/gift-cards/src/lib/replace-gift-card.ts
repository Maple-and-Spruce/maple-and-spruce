/**
 * Replace a lost gift card (#332): move its balance to a new card and turn
 * the lost one off. Admin only.
 *
 * Square's own balance transfer (`TRANSFER_BALANCE_FROM` / `_TO`) is
 * something Square records when it moves a balance itself; the API cannot
 * create it. So the move is made of activities the API does support:
 *
 *   1. Make a new digital card (`PENDING`, nothing on it).
 *   2. Record it: `giftCardPurchases/{newId}`, `source: 'replacement'`,
 *      `replacesGiftCardId`, and the amount being moved. Written before any
 *      money moves, so every later step knows the amount even after the old
 *      card is empty.
 *   3. Take the balance off the lost card (`ADJUST_DECREMENT`).
 *   4. Put it on the new card (`ACTIVATE` with the amount and no order).
 *   5. Turn the lost card off (`DEACTIVATE`).
 *
 * The order is what keeps the money safe. The balance comes off the lost
 * card before it goes on the new one, so **no failure ever leaves both cards
 * holding it**. A failure at each step leaves:
 *
 *   - 1 or 2: the balance on the lost card only. Nothing moved.
 *   - 3: the balance on the lost card only. Square refuses to take more than
 *     the balance, so a card spent in the meantime fails here, not below zero.
 *   - 4: the balance on neither card for the moment. It is not lost: the
 *     record from step 2 holds the amount, Square's history of the lost card
 *     shows it coming off, and trying again (any click on the same lost card)
 *     puts it on the new card. This is the one in-between state, and it is
 *     the safe one: a lost card may be in someone else's hands, so the money
 *     must never be on it and the new card at once.
 *   - 5: the balance on the new card only. The lost card holds nothing, so
 *     nothing can be spent from it; trying again turns it off.
 *
 * Retries are idempotent. A retry finds the record by the lost card's id and
 * resumes from where it stopped. Every Square call uses a key derived from
 * the click (the create) or from the new card (the moves), so a retried call
 * returns Square's first answer instead of moving money twice; on top of
 * that, step 3 is skipped when the lost card's history already shows it, and
 * step 4 when the new card is already active.
 *
 * Logs `gift_card_replaced {oldId, newId, balanceCents, uid}`, never a code.
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
  type GiftCardActivityEntry,
  type GiftCardPurchase,
  giftCardStateLabel,
  redactGiftCertificateCodes,
} from '@maple/ts/domain';
import type {
  ReplaceGiftCardRequest,
  ReplaceGiftCardResponse,
} from '@maple/ts/firebase/api-types';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

/** Square keys. The create comes from the click; the moves from the new card. */
export function replaceGiftCardKeys(idempotencyKey: string, newGiftCardId?: string) {
  const click = sha(idempotencyKey);
  const card = newGiftCardId ? sha(newGiftCardId) : '';
  return {
    create: `gc-repl-create-${click.slice(0, 40)}`,
    decrement: (amountCents: number) => `gc-repl-dec-${card.slice(0, 40)}-${amountCents}`,
    activate: `gc-repl-activate-${card.slice(0, 40)}`,
    deactivate: `gc-repl-deactivate-${card.slice(0, 40)}`,
    /** Shown on the new card's Square activity. */
    referenceId: `repl-${card.slice(0, 12)}`,
  };
}

/**
 * Square's clocks and ours are close but not equal, so the lost card's
 * history is read from a little before our record was written.
 */
const CLOCK_SLACK_MS = 5 * 60 * 1000;

/** Whether the lost card's history already shows the balance taken off. */
export function balanceAlreadyTakenOff(
  history: readonly GiftCardActivityEntry[],
  amountCents: number,
  recordedAt: Date
): boolean {
  const from = recordedAt.getTime() - CLOCK_SLACK_MS;
  return history.some(
    (a) =>
      a.type === 'adjust_decrement' &&
      a.amountCents === -amountCents &&
      Date.parse(a.createdAt) >= from
  );
}

function errorText(error: unknown): string {
  return redactGiftCertificateCodes(error instanceof Error ? error.message : String(error));
}

export async function replaceGiftCard(
  data: ReplaceGiftCardRequest,
  context: FunctionContext,
  secrets: SquareSecrets,
  strings: SquareStrings
): Promise<ReplaceGiftCardResponse> {
  const oldId = typeof data?.giftCardId === 'string' ? data.giftCardId.trim() : '';
  const idempotencyKey =
    typeof data?.idempotencyKey === 'string' ? data.idempotencyKey.trim() : '';
  if (!oldId) throwInvalidArgument('Gift card id is required');
  if (!idempotencyKey) throwInvalidArgument('Idempotency key is required');

  const square = new Square(secrets, strings);
  const giftCards = square.giftCardsService;
  const logBase = { oldGiftCardId: oldId, uid: context.uid ?? null };
  const fail = (step: string, error: unknown, newGiftCardId?: string) =>
    console.error(
      JSON.stringify({
        event: 'gift_card_replace_failed',
        ...logBase,
        newGiftCardId: newGiftCardId ?? null,
        step,
        error: errorText(error),
      })
    );

  // Steps 1 and 2, or the record of an earlier try.
  let record = await GiftCardPurchaseRepository.findByReplacesGiftCardId(oldId);
  if (!record) {
    record = await startReplacement(oldId, idempotencyKey, context, square, fail);
  }
  const newId = record.giftCardId;
  const amountCents = record.valueCents;
  const keys = replaceGiftCardKeys(idempotencyKey, newId);

  const newCard = await giftCards.getGiftCard(newId);
  if (!newCard) throwNotFound('Replacement gift card', newId);

  if (newCard.state === 'pending') {
    // Step 3: take the balance off the lost card.
    const oldCard = await giftCards.getGiftCard(oldId);
    if (!oldCard) throwNotFound('Gift card', oldId);
    const history = await giftCards.listCardHistory(oldId, oldCard.createdAt);
    if (!balanceAlreadyTakenOff(history, amountCents, record.createdAt)) {
      try {
        await giftCards.adjustDecrement({
          giftCardId: oldId,
          locationId: square.locationId,
          amountCents,
          idempotencyKey: keys.decrement(amountCents),
        });
      } catch (error) {
        fail('decrement', error, newId);
        throw new Error(
          `Square could not take the money off the lost card, so nothing was moved: it still holds its balance. Try again. (${errorText(error)})`,
          { cause: error }
        );
      }
    }

    // Step 4: put it on the new card.
    try {
      await giftCards.activateGiftCardWithoutOrder({
        giftCardId: newId,
        locationId: square.locationId,
        amountCents,
        referenceId: keys.referenceId,
        buyerPaymentInstrumentIds: [keys.referenceId],
        idempotencyKey: keys.activate,
      });
    } catch (error) {
      fail('activate', error, newId);
      throw new Error(
        `Square took ${formatGiftCardDollars(amountCents)} off the lost card but could not put it on the new card ending ${record.last4} yet. Nothing is lost: try again and it will finish. (${errorText(error)})`,
        { cause: error }
      );
    }
  }

  // Step 5: turn the lost card off.
  const response: ReplaceGiftCardResponse = {
    oldGiftCardId: oldId,
    newGiftCardId: newId,
    last4: record.last4,
    balanceCents: amountCents,
  };
  const oldNow = await giftCards.getGiftCard(oldId);
  if (oldNow && oldNow.state !== 'deactivated') {
    try {
      await giftCards.deactivate({
        giftCardId: oldId,
        locationId: square.locationId,
        idempotencyKey: keys.deactivate,
      });
    } catch (error) {
      fail('deactivate', error, newId);
      response.warning =
        'The money is on the new card, but Square did not turn the lost card off. It holds nothing, so nothing can be spent from it. Try again to turn it off.';
    }
  }

  console.log(
    JSON.stringify({
      event: 'gift_card_replaced',
      oldId,
      newId,
      balanceCents: amountCents,
      uid: context.uid ?? null,
      ...(response.warning ? { oldCardStillOn: true } : {}),
    })
  );
  return response;
}

/**
 * Steps 1 and 2: check the lost card, make the new one and record it with the
 * amount to move. Nothing has moved yet if this fails.
 */
async function startReplacement(
  oldId: string,
  idempotencyKey: string,
  context: FunctionContext,
  square: Square,
  fail: (step: string, error: unknown, newGiftCardId?: string) => void
): Promise<GiftCardPurchase> {
  const giftCards = square.giftCardsService;
  const oldCard = await giftCards.getGiftCard(oldId);
  if (!oldCard) throwNotFound('Gift card', oldId);
  if (oldCard.state !== 'active') {
    throwFailedPrecondition(
      oldCard.state === 'pending'
        ? 'This card has not been sold yet, so there is nothing on it to move.'
        : `Only an active card can be replaced. This one is ${giftCardStateLabel(oldCard.state).toLowerCase()}.`
    );
  }
  if (oldCard.balanceCents <= 0) {
    throwFailedPrecondition(
      'This card has no money on it, so there is nothing to move to a new card.'
    );
  }

  const oldRecord = await GiftCardPurchaseRepository.findByGiftCardId(oldId);
  const keys = replaceGiftCardKeys(idempotencyKey);

  let created: { id: string; last4: string };
  try {
    created = await giftCards.createDigitalGiftCard({
      locationId: square.locationId,
      idempotencyKey: keys.create,
    });
  } catch (error) {
    fail('create', error);
    throw new Error(
      'Square could not make the new card, so nothing was moved. Try again.',
      { cause: error }
    );
  }

  // A class certificate stays one: the new card covers the same class type.
  const record: Omit<GiftCardPurchase, 'createdAt'> = {
    giftCardId: created.id,
    last4: created.last4,
    kind: oldRecord?.kind ?? 'amount',
    valueCents: oldCard.balanceCents,
    source: 'replacement',
    replacesGiftCardId: oldId,
    classCategoryId: oldRecord?.classCategoryId,
    className: oldRecord?.className,
    recordedByUid: context.uid,
  };
  try {
    return await GiftCardPurchaseRepository.create(record);
  } catch (error) {
    // A second click of the same dialog got here first: use its record.
    const existing = await GiftCardPurchaseRepository.findByGiftCardId(created.id);
    if (existing?.replacesGiftCardId === oldId) return existing;
    fail('record', error, created.id);
    throw new Error(
      'Square made the new card but it could not be recorded, so nothing was moved. Try again.',
      { cause: error }
    );
  }
}
