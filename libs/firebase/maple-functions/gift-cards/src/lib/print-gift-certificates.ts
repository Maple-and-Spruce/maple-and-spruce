/**
 * Printed gift certificates (#314, #332).
 *
 * - `printGiftCertificates`: Katie prints a batch. Each certificate is a real
 *   Square card with a short code (`MAPLE` + year + 3 random digits), made
 *   with **no money on it**: Square keeps it `PENDING`. It is sold at the
 *   register, where the Square app loads it (Check Balance, scan or type the
 *   code, load the amount, add the customer, charge), which Square books as a
 *   gift card sale. Nothing happens here at the sale.
 * - `getCertificateBatch`: the print view reads every code in a batch. The
 *   codes are never stored and never logged; each read is logged with who
 *   asked.
 *
 * Retries are safe. The batch id comes from the dialog's key, and our record
 * of each certificate is written with `create`, which never overwrites, so a
 * retry of a half-finished batch makes only the missing ones. A certificate
 * whose card was made but whose record was not is made again on a retry with
 * a new code; the first card holds no money and its code was never printed,
 * so it is harmless.
 */
import { createHash, randomInt } from 'crypto';
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
  isGiftCardCodeTakenError,
  Square,
  type SquareSecrets,
  type SquareStrings,
} from '@maple/firebase/square';
import {
  formatGiftCardDollars,
  GIFT_CERTIFICATE_CODE_ATTEMPTS,
  makeGiftCertificateCode,
  type RandomInt,
  redactGiftCertificateCodes,
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

/**
 * The batch id and each certificate's Square create key, all from the
 * dialog's key. The key also names the code tried, so drawing a new code
 * after a clash is a new request to Square, not a reused key.
 */
export function certificateBatchKeys(idempotencyKey: string) {
  const hash = createHash('sha256').update(idempotencyKey).digest('hex');
  return {
    batchId: `cert-${hash.slice(0, 16)}`,
    create: (index: number, code: string) =>
      `gc-cert-create-${hash.slice(0, 40)}-${index}-${code}`,
  };
}

/** Production's random source: Node's cryptographic `randomInt`. */
const cryptoRandomInt: RandomInt = (maxExclusive) => randomInt(maxExclusive);

/**
 * Make one card in Square with a MAPLE code, drawing again when Square
 * already has a card with that code. Gives up after
 * `GIFT_CERTIFICATE_CODE_ATTEMPTS` clashes with a clear error. Used for
 * printed certificates and for cards bought online.
 */
export async function createCertificateCard<T>(input: {
  create: (gan: string, idempotencyKey: string) => Promise<T>;
  keyFor: (code: string) => string;
  now: Date;
  random: RandomInt;
}): Promise<T> {
  for (let attempt = 1; attempt <= GIFT_CERTIFICATE_CODE_ATTEMPTS; attempt++) {
    const code = makeGiftCertificateCode(input.now, input.random);
    try {
      return await input.create(code, input.keyFor(code));
    } catch (error) {
      if (!isGiftCardCodeTakenError(error)) throw error;
    }
  }
  throw new Error(
    `Square already had a card with each of the ${GIFT_CERTIFICATE_CODE_ATTEMPTS} codes tried. This year's certificate codes may be nearly used up (there are 1,000 a year).`
  );
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

/** An error for the logs, with any certificate code hidden. */
function errorText(error: unknown): string {
  return redactGiftCertificateCodes(error instanceof Error ? error.message : String(error));
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
 * Make a batch of printed certificates, with no money on them. Returns the
 * ones that exist; if some could not be made, says so, and trying again with
 * the same dialog makes the rest.
 */
export async function printGiftCertificates(
  data: PrintGiftCertificatesRequest,
  context: FunctionContext,
  secrets: SquareSecrets,
  strings: SquareStrings,
  random: RandomInt = cryptoRandomInt,
  now: Date = new Date()
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
    let step = 'create';
    try {
      // No activation: the card stays PENDING, holding nothing, until the
      // register loads it at the sale (#332).
      const created = await createCertificateCard({
        create: (gan, idempotencyKey) =>
          giftCards.createDigitalGiftCard({
            locationId: square.locationId,
            idempotencyKey,
            gan,
          }),
        keyFor: (code) => keys.create(index, code),
        now,
        random,
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
      `Square could not make the certificates. Try again. (${errorText(failure)})`,
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
    response.error = `Square made ${cards.length} of ${data.quantity}. Those are ready to print. Try again to make the rest.`;
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
