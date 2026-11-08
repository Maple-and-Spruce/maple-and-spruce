/**
 * The two admin actions on the Gift Cards page (#310).
 *
 * - `markClassCertificate`: a card sold at the register becomes a class
 *   certificate for one class type. Writes our record only. The money was
 *   taken at the register; nothing changes in Square.
 * - `issueGiftCard`: the studio gives a free card. Makes a digital card in
 *   Square and loads it without an order (no sale, no payment), then records
 *   why. The value comes out of the studio's pocket when it is spent.
 *
 * Both validate before any Square call or write, and neither ever logs or
 * returns the full card code: Katie gets it from `revealGiftCardCode`, which
 * logs who asked.
 */
import { createHash } from 'crypto';
import {
  type FunctionContext,
  throwFailedPrecondition,
  throwInvalidArgument,
  throwNotFound,
  throwValidationError,
} from '@maple/firebase/functions';
import {
  ClassCategoryRepository,
  GiftCardPurchaseRepository,
} from '@maple/firebase/database';
import {
  Square,
  type SquareSecrets,
  type SquareStrings,
} from '@maple/firebase/square';
import {
  formatGiftCardDollars,
  type GiftCardPurchase,
  giftCardPurchaseSource,
  normalizeGiftCardCode,
  originalGiftCardValueCents,
} from '@maple/ts/domain';
import type {
  GiftCardPurchaseDetails,
  IssueGiftCardRequest,
  IssueGiftCardResponse,
  MarkClassCertificateRequest,
  MarkClassCertificateResponse,
} from '@maple/ts/firebase/api-types';
import {
  issueGiftCardValidation,
  markClassCertificateValidation,
} from '@maple/ts/validation';

/** A trimmed string, or undefined when blank. */
function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function toDetails(
  purchase: GiftCardPurchase,
  classCategoryName?: string
): GiftCardPurchaseDetails {
  return {
    ...purchase,
    createdAt: purchase.createdAt.toISOString(),
    classCategoryName,
  };
}

/** What an existing record already says the card is, for a refusal. */
function describeExisting(purchase: GiftCardPurchase): string {
  const value = formatGiftCardDollars(purchase.valueCents);
  const what =
    purchase.kind === 'class'
      ? `a ${value} class certificate for ${purchase.className ?? 'a class'}`
      : `a ${value} gift card`;
  switch (giftCardPurchaseSource(purchase)) {
    case 'issued':
      return `This card was given free by the studio as ${what}. It can't be changed.`;
    case 'register':
      return `This card is already ${what}.`;
    default:
      return `This card was bought online as ${what}. It can't be changed.`;
  }
}

/**
 * Make a register-sold card a class certificate. Its value is what was loaded
 * when it was sold, read from its Square history, not today's balance.
 */
export async function markClassCertificate(
  data: MarkClassCertificateRequest,
  context: FunctionContext,
  secrets: SquareSecrets,
  strings: SquareStrings
): Promise<MarkClassCertificateResponse> {
  const result = markClassCertificateValidation(data ?? {});
  if (result.hasErrors()) throwValidationError(result.getErrors());

  const existing = await GiftCardPurchaseRepository.findByGiftCardId(data.giftCardId);
  if (existing) throwFailedPrecondition(describeExisting(existing));

  const category = await ClassCategoryRepository.findById(data.classCategoryId);
  if (!category) throwNotFound('Class type', data.classCategoryId);

  const giftCards = new Square(secrets, strings).giftCardsService;
  const card = await giftCards.getGiftCard(data.giftCardId);
  if (!card) throwNotFound('Gift card', data.giftCardId);
  if (card.state !== 'active') {
    throwFailedPrecondition(
      'Only an active card can be a class certificate. Sell or load it in Square first.'
    );
  }

  const activities = await giftCards.listCardHistory(card.id, card.createdAt);
  const valueCents = originalGiftCardValueCents(activities);
  if (!valueCents) {
    throwFailedPrecondition(
      "Square's history for this card doesn't show how much was put on it, so it can't be a class certificate here."
    );
  }

  const record: Omit<GiftCardPurchase, 'createdAt'> = {
    giftCardId: card.id,
    last4: card.last4,
    kind: 'class',
    valueCents,
    source: 'register',
    classCategoryId: category.id,
    className: category.name,
    recipientName: optionalText(data.recipientName),
    fromName: optionalText(data.fromName),
    message: optionalText(data.message),
    recordedByUid: context.uid,
  };

  let created: GiftCardPurchase;
  try {
    created = await GiftCardPurchaseRepository.create(record);
  } catch (error) {
    // Two clicks at once: `create` refuses to overwrite, so say what won.
    const winner = await GiftCardPurchaseRepository.findByGiftCardId(card.id);
    if (winner) throwFailedPrecondition(describeExisting(winner));
    throw error;
  }

  console.log(
    JSON.stringify({
      event: 'gift_card_marked_class_certificate',
      giftCardId: card.id,
      classCategoryId: category.id,
      valueCents,
      uid: context.uid ?? null,
    })
  );
  return { purchase: toDetails(created, category.name) };
}

/** Square keys and our reference, all derived from the dialog's key. */
export function issueGiftCardKeys(idempotencyKey: string) {
  const hash = createHash('sha256').update(idempotencyKey).digest('hex');
  return {
    create: `gc-issue-create-${hash.slice(0, 40)}`,
    activate: `gc-issue-activate-${hash.slice(0, 40)}`,
    /** Shown on the card's Square activity; short so it reads in the Dashboard. */
    referenceId: `comp-${hash.slice(0, 12)}`,
  };
}

/**
 * Give a free card. A retry with the same key finds the same Square card (the
 * create is idempotent) and the record already written, so it returns the
 * same answer instead of making a second card.
 */
export async function issueGiftCard(
  data: IssueGiftCardRequest,
  context: FunctionContext,
  secrets: SquareSecrets,
  strings: SquareStrings
): Promise<IssueGiftCardResponse> {
  const result = issueGiftCardValidation(data ?? {});
  if (result.hasErrors()) throwValidationError(result.getErrors());

  let valueCents: number;
  let classCategoryId: string | undefined;
  let className: string | undefined;
  if (data.kind === 'class') {
    const category = await ClassCategoryRepository.findById(data.classCategoryId);
    if (!category) throwNotFound('Class type', data.classCategoryId);
    valueCents = data.valueCents;
    classCategoryId = category.id;
    className = category.name;
  } else {
    valueCents = data.amountCents;
  }

  const reason = data.reason.trim();
  const keys = issueGiftCardKeys(data.idempotencyKey);
  const logBase = {
    kind: data.kind,
    valueCents,
    uid: context.uid ?? null,
    referenceId: keys.referenceId,
  };

  const square = new Square(secrets, strings);
  const giftCards = square.giftCardsService;
  let card: { id: string; last4: string };
  try {
    const code = data.code?.trim() ? normalizeGiftCardCode(data.code) : undefined;
    const created = await giftCards.createDigitalGiftCard({
      locationId: square.locationId,
      idempotencyKey: keys.create,
      gan: code,
    });
    card = { id: created.id, last4: created.last4 };
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'gift_card_issue_failed',
        step: 'create',
        ...logBase,
        error: error instanceof Error ? error.message : String(error),
      })
    );
    const detail = error instanceof Error ? error.message : '';
    if (data.code?.trim() && /gan|already|exists|invalid/i.test(detail)) {
      // Square's own words say what is wrong with a chosen code (in use, a
      // bank-card prefix); the message never contains anyone's other codes.
      throwInvalidArgument(
        `Square would not use that code: ${detail.replace(/^Square could not create gift card: /, '')}. Nothing was given.`
      );
    }
    throw new Error('Square could not make the gift card. Nothing was given; try again.', {
      cause: error,
    });
  }

  const response: IssueGiftCardResponse = {
    giftCardId: card.id,
    last4: card.last4,
    kind: data.kind,
    valueCents,
    className,
    recorded: true,
  };

  // A retry of an issue that already finished.
  const earlier = await GiftCardPurchaseRepository.findByGiftCardId(card.id);
  if (earlier) {
    console.log(
      JSON.stringify({ event: 'gift_card_issue_retried', ...logBase, giftCardId: card.id })
    );
    return { ...response, valueCents: earlier.valueCents };
  }

  try {
    await giftCards.activateGiftCardWithoutOrder({
      giftCardId: card.id,
      locationId: square.locationId,
      amountCents: valueCents,
      referenceId: keys.referenceId,
      buyerPaymentInstrumentIds: [keys.referenceId],
      idempotencyKey: keys.activate,
    });
  } catch (error) {
    // The card exists but has no money on it (`PENDING`), so nothing was
    // given. Trying again with the same dialog reuses this card.
    console.error(
      JSON.stringify({
        event: 'gift_card_issue_failed',
        step: 'activate',
        ...logBase,
        giftCardId: card.id,
        error: error instanceof Error ? error.message : String(error),
      })
    );
    throw new Error(
      'Square made the card but could not put the money on it, so nothing was given. Try again.',
      { cause: error }
    );
  }

  try {
    await GiftCardPurchaseRepository.create({
      giftCardId: card.id,
      last4: card.last4,
      kind: data.kind,
      valueCents,
      source: 'issued',
      classCategoryId,
      className,
      recipientName: optionalText(data.recipientName),
      fromName: optionalText(data.fromName),
      message: optionalText(data.message),
      reason,
      recordedByUid: context.uid,
    });
  } catch (error) {
    // The card is live and loaded; only our note about it is missing.
    console.error(
      JSON.stringify({
        event: 'gift_card_issue_record_failed',
        ...logBase,
        giftCardId: card.id,
        error: error instanceof Error ? error.message : String(error),
      })
    );
    response.recorded = false;
  }

  console.log(
    JSON.stringify({
      event: 'gift_card_issued',
      giftCardId: card.id,
      valueCents,
      uid: context.uid ?? null,
      reason,
      kind: data.kind,
      classCategoryId: classCategoryId ?? null,
      referenceId: keys.referenceId,
      amount: formatGiftCardDollars(valueCents),
    })
  );
  return response;
}
