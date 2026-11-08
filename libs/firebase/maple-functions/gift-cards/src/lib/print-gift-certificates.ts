/**
 * Printed gift certificates (#314).
 *
 * - `printGiftCertificates`: Katie prints a batch. Each certificate is a real
 *   Square card, made and loaded now (the same two Square calls as a free card,
 *   `issueGiftCard`), so it is spendable as soon as it is printed. When one is
 *   sold she rings up the "Gift certificate" item at the register; nothing
 *   happens here.
 * - `getCertificateBatch`: the print view reads every code in a batch. The
 *   codes are never stored and never logged; each read is logged with who
 *   asked.
 *
 * Retries are safe. The batch id and every Square key come from the dialog's
 * key and the certificate's place in the batch: Square's create returns the
 * same card for the same key, its activate returns the same activity for the
 * same key, and our record is written with `create`, which never overwrites.
 * So trying a half-finished batch again finishes it without a second card.
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
  isGiftCertificateCategory,
  isGiftCertificateDesignId,
} from '@maple/ts/domain';
import type {
  GetCertificateBatchRequest,
  GetCertificateBatchResponse,
  PrintGiftCertificatesRequest,
  PrintGiftCertificatesResponse,
  PrintedCertificateCard,
} from '@maple/ts/firebase/api-types';
import { printGiftCertificatesValidation } from '@maple/ts/validation';

/** How many certificates are made at once. Square allows far more; be gentle. */
const CONCURRENCY = 5;

/** The batch id and each certificate's Square keys, all from the dialog's key. */
export function certificateBatchKeys(idempotencyKey: string) {
  const hash = createHash('sha256').update(idempotencyKey).digest('hex');
  return {
    batchId: `cert-${hash.slice(0, 16)}`,
    card: (index: number) => ({
      create: `gc-cert-create-${hash.slice(0, 40)}-${index}`,
      activate: `gc-cert-activate-${hash.slice(0, 40)}-${index}`,
      /** Shown on the card's Square activity: the batch and its place in it. */
      referenceId: `cert-${hash.slice(0, 10)}-${index + 1}`,
    }),
  };
}

/** Run `work` over `items`, a few at a time, stopping after the first failure. */
async function inGroups<T>(
  items: readonly T[],
  size: number,
  work: (item: T) => Promise<void>
): Promise<unknown | undefined> {
  for (let start = 0; start < items.length; start += size) {
    const results = await Promise.allSettled(items.slice(start, start + size).map(work));
    const failed = results.find(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    );
    if (failed) return failed.reason;
  }
  return undefined;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** What the batch is worth, and for a class batch which type. */
async function resolveValue(data: PrintGiftCertificatesRequest): Promise<{
  valueCents: number;
  classCategoryId?: string;
  className?: string;
}> {
  if (data.kind === 'amount') return { valueCents: data.amountCents };
  const category = await ClassCategoryRepository.findById(data.classCategoryId);
  if (!category) throwNotFound('Class type', data.classCategoryId);
  if (!isGiftCertificateCategory(category)) {
    throwFailedPrecondition(
      `Gift certificates are switched off for ${category.name}. Switch them on and set a price in Settings first.`
    );
  }
  return {
    valueCents: category.giftCertificatePriceCents as number,
    classCategoryId: category.id,
    className: category.name,
  };
}

/**
 * Make and load a batch of printed certificates. Returns the ones that exist;
 * if some could not be made, says so, and trying again with the same dialog
 * makes the rest.
 */
export async function printGiftCertificates(
  data: PrintGiftCertificatesRequest,
  context: FunctionContext,
  secrets: SquareSecrets,
  strings: SquareStrings
): Promise<PrintGiftCertificatesResponse> {
  const result = printGiftCertificatesValidation(data ?? {});
  if (result.hasErrors()) throwValidationError(result.getErrors());

  const { valueCents, classCategoryId, className } = await resolveValue(data);
  const keys = certificateBatchKeys(data.idempotencyKey);
  const { batchId } = keys;

  // A retry: keep what the first try made, and refuse a batch that changed.
  const earlier = await GiftCardPurchaseRepository.findByBatchId(batchId);
  const changed = earlier.find(
    (r) =>
      r.kind !== data.kind ||
      r.valueCents !== valueCents ||
      r.classCategoryId !== classCategoryId ||
      r.design !== data.design
  );
  if (changed) {
    throwFailedPrecondition(
      'This batch was started with a different amount or design. Close this and open it again to print a new batch.'
    );
  }
  const made = new Map<number, PrintedCertificateCard>();
  for (const record of earlier) {
    if (record.batchIndex !== undefined) {
      made.set(record.batchIndex, { giftCardId: record.giftCardId, last4: record.last4 });
    }
  }

  const square = new Square(secrets, strings);
  const giftCards = square.giftCardsService;
  const logBase = {
    batchId,
    kind: data.kind,
    valueCents,
    classCategoryId: classCategoryId ?? null,
    design: data.design,
    uid: context.uid ?? null,
  };

  const makeOne = async (index: number): Promise<void> => {
    const cardKeys = keys.card(index);
    let step = 'create';
    try {
      const created = await giftCards.createDigitalGiftCard({
        locationId: square.locationId,
        idempotencyKey: cardKeys.create,
      });
      step = 'activate';
      await giftCards.activateGiftCardWithoutOrder({
        giftCardId: created.id,
        locationId: square.locationId,
        amountCents: valueCents,
        referenceId: cardKeys.referenceId,
        buyerPaymentInstrumentIds: [cardKeys.referenceId],
        idempotencyKey: cardKeys.activate,
      });
      step = 'record';
      const record: Omit<GiftCardPurchase, 'createdAt'> = {
        giftCardId: created.id,
        last4: created.last4,
        kind: data.kind,
        valueCents,
        source: 'stock',
        classCategoryId,
        className,
        batchId,
        batchIndex: index,
        design: data.design,
        recordedByUid: context.uid,
      };
      try {
        await GiftCardPurchaseRepository.create(record);
      } catch (error) {
        // Already written by an earlier try of this same certificate is fine.
        const existing = await GiftCardPurchaseRepository.findByGiftCardId(created.id);
        if (existing?.batchId !== batchId) throw error;
      }
      made.set(index, { giftCardId: created.id, last4: created.last4 });
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'gift_certificate_print_failed',
          ...logBase,
          index,
          step,
          error: errorText(error),
        })
      );
      throw error;
    }
  };

  const toMake = Array.from({ length: data.quantity }, (_, i) => i).filter(
    (i) => !made.has(i)
  );
  const failure = await inGroups(toMake, CONCURRENCY, makeOne);

  const cards = [...made.entries()]
    .filter(([index]) => index < data.quantity)
    .sort(([a], [b]) => a - b)
    .map(([, card]) => card);

  console.log(
    JSON.stringify({
      event: 'gift_certificates_printed',
      ...logBase,
      requested: data.quantity,
      count: cards.length,
      amount: formatGiftCardDollars(valueCents),
    })
  );

  if (failure && cards.length === 0) {
    throw new Error(
      'Square could not make the certificates, so nothing was loaded. Try again.',
      { cause: failure }
    );
  }

  const response: PrintGiftCertificatesResponse = {
    batchId,
    requested: data.quantity,
    cards,
    valueCents,
  };
  if (failure) {
    response.error = `Square made ${cards.length} of ${data.quantity}. Those are loaded and ready to print. Try again to make the rest.`;
  }
  return response;
}

/**
 * Every certificate in a batch with its full code, for the print view. The
 * codes are read from Square each time and never stored or logged.
 */
export async function getCertificateBatch(
  data: GetCertificateBatchRequest,
  context: FunctionContext,
  secrets: SquareSecrets,
  strings: SquareStrings
): Promise<GetCertificateBatchResponse> {
  const batchId = typeof data?.batchId === 'string' ? data.batchId.trim() : '';
  if (!batchId) throwInvalidArgument('Batch id is required');

  const records = await GiftCardPurchaseRepository.findByBatchId(batchId);
  if (records.length === 0) throwNotFound('Certificate batch', batchId);

  const first = records[0];
  if (!isGiftCertificateDesignId(first.design)) {
    throwFailedPrecondition('This batch has no design the print view knows.');
  }

  const giftCards = new Square(secrets, strings).giftCardsService;
  const codes = new Map<string, string>();
  const failure = await inGroups(records, CONCURRENCY, async (record) => {
    const code = await giftCards.getGiftCardCode(record.giftCardId);
    if (!code) throw new Error(`Square has no card ${record.giftCardId}`);
    codes.set(record.giftCardId, code);
  });
  if (failure) {
    console.error(
      JSON.stringify({
        event: 'gift_certificate_batch_reveal_failed',
        batchId,
        uid: context.uid ?? null,
        error: errorText(failure),
      })
    );
    throw new Error('Square could not read the codes for this batch. Try again.', {
      cause: failure,
    });
  }

  console.log(
    JSON.stringify({
      event: 'gift_certificate_batch_revealed',
      batchId,
      count: records.length,
      uid: context.uid ?? null,
    })
  );

  return {
    batchId,
    design: first.design,
    kind: first.kind,
    valueCents: first.valueCents,
    ...(first.className ? { className: first.className } : {}),
    certificates: records.map((r) => ({
      giftCardId: r.giftCardId,
      last4: r.last4,
      code: codes.get(r.giftCardId) as string,
    })),
  };
}
