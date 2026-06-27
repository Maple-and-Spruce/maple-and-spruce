/**
 * Charge Music Together Installments (scheduled + admin-callable)
 *
 * Drains the `musicTogetherScheduledCharges` queue: any charge that is `due`
 * (status `scheduled`, `dueAt <= now`) is charged against the family's stored
 * card on MT's separate Square account.
 *
 * Overcharge safety — a charge is taken AT MOST ONCE, enforced at three layers:
 *   1. Firestore lease: `tryClaimLease` flips `scheduled → charging` in a
 *      transaction, so two overlapping runs can't both process one charge.
 *   2. Stable Square idempotency key (`charge.idempotencyKey`, derived from the
 *      doc id): a retry returns the original payment instead of charging again.
 *   3. Cancel guard: a cancelled registration is never charged (checked below),
 *      and cancelling flips its charges out of `scheduled`.
 *
 * Failures are LOUD: the charge goes `failed`, the parent is emailed, and the
 * failed charge surfaces to admins (no silent retries — manual resolution).
 *
 * Mirrors sendClassReminders' split: a plain `runDueInstallmentCharges` wrapped
 * by an `onSchedule` trigger AND an admin-callable trigger (the latter drives
 * integration tests + manual catch-up, and supports a dry run). Both build a
 * Square client for the MT account and pass it in.
 *
 * Deployed to us-east4 via CI/CD (maple-square codebase).
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { Functions, Role } from '@maple/firebase/functions';
import {
  Square,
  MT_SQUARE_SECRET_NAMES,
  MT_SQUARE_STRING_NAMES,
  MT_SQUARE_KEYS,
  PaymentError,
} from '@maple/firebase/square';
import {
  MusicTogetherScheduledChargeRepository,
  MusicTogetherRegistrationRepository,
  getDb,
} from '@maple/firebase/database';
import type { MusicTogetherScheduledCharge } from '@maple/ts/domain';
import type {
  ChargeMusicTogetherInstallmentsRequest,
  MusicTogetherInstallmentChargeResult,
} from '@maple/ts/firebase/api-types';

const TIMEZONE = 'America/New_York';

// Secret/string params for the MT Square account, declared for the scheduled
// trigger (the admin-callable trigger gets them via the fluent builder).
const mtSecretParams = MT_SQUARE_SECRET_NAMES.map((name) => defineSecret(name));
const mtStringParams = MT_SQUARE_STRING_NAMES.map((name) => defineString(name));

/**
 * Core logic — pure of the trigger wiring so both triggers (and tests) share
 * it. Charges every due installment against its registration's stored card.
 *
 * @param now    The reference time ("due" = dueAt <= now).
 * @param square A Square client already bound to the MT account.
 * @param opts   `dryRun` reports what would be charged without taking payment.
 */
export async function runDueInstallmentCharges(
  now: Date,
  square: Square,
  opts: { dryRun?: boolean } = {}
): Promise<MusicTogetherInstallmentChargeResult> {
  const due = await MusicTogetherScheduledChargeRepository.findDue(now);

  if (opts.dryRun) {
    return {
      due: due.length,
      charged: 0,
      failed: 0,
      skipped: 0,
      dryRun: true,
      wouldCharge: due.map((c) => ({
        chargeId: c.id,
        registrationId: c.registrationId,
        amountCents: c.amountCents,
        installmentNumber: c.installmentNumber,
      })),
    };
  }

  let charged = 0;
  let failed = 0;
  let skipped = 0;

  for (const charge of due) {
    // Layer 1: claim the lease. If we lose it (overlapping run, or no longer
    // scheduled), skip — never process a charge twice.
    const claimed = await MusicTogetherScheduledChargeRepository.tryClaimLease(
      charge.id
    );
    if (!claimed) {
      skipped++;
      continue;
    }

    const registration = await MusicTogetherRegistrationRepository.findById(
      charge.registrationId
    );

    // Layer 3: never charge a cancelled / non-chargeable registration.
    if (
      !registration ||
      registration.status === 'cancelled' ||
      registration.status === 'refunded' ||
      !registration.squareCardId ||
      !registration.squareCustomerId
    ) {
      await markFailed(
        charge,
        'Registration is not chargeable (cancelled or no card on file).'
      );
      failed++;
      continue;
    }

    try {
      const payment = await square.paymentsService.createPayment({
        sourceId: registration.squareCardId,
        customerId: registration.squareCustomerId,
        amountCents: charge.amountCents,
        // Layer 2: stable key — a retry can never double-charge.
        idempotencyKey: charge.idempotencyKey,
        locationId: square.locationId,
        buyerEmailAddress: registration.email,
        note: `Music Together installment ${charge.installmentNumber}`,
        referenceId: charge.registrationId,
      });

      await MusicTogetherScheduledChargeRepository.update({
        id: charge.id,
        status: 'paid',
        squarePaymentId: payment.paymentId,
        resolvedAt: new Date(),
      });
      charged++;
    } catch (error) {
      const detail =
        error instanceof PaymentError || error instanceof Error
          ? error.message
          : 'Unknown error';
      await markFailed(charge, detail);
      // Loud failure: email the parent + leave the failed charge for admins.
      await queueFailureEmail(registration.email, charge, detail);
      failed++;
    }
  }

  console.log(
    `[chargeMusicTogetherInstallments] due=${due.length} charged=${charged} failed=${failed} skipped=${skipped}`
  );

  return { due: due.length, charged, failed, skipped, dryRun: false };
}

async function markFailed(
  charge: MusicTogetherScheduledCharge,
  reason: string
): Promise<void> {
  await MusicTogetherScheduledChargeRepository.update({
    id: charge.id,
    status: 'failed',
    lastError: reason,
    resolvedAt: new Date(),
  });
}

async function queueFailureEmail(
  to: string,
  charge: MusicTogetherScheduledCharge,
  reason: string
): Promise<void> {
  // Template `music-together-installment-failed` is authored separately.
  await getDb()
    .collection('mail')
    .add({
      to,
      template: {
        name: 'music-together-installment-failed',
        data: {
          installmentNumber: charge.installmentNumber,
          amountCents: charge.amountCents,
          reason,
        },
      },
    });
}

/** Build a Square client bound to the MT account from the trigger's params. */
function buildMtSquare(): Square {
  const secrets = Object.fromEntries(
    mtSecretParams.map((s) => [s.name, s.value()])
  );
  const strings = Object.fromEntries(
    mtStringParams.map((s) => [s.name, s.value()])
  );
  return new Square(secrets, strings, MT_SQUARE_KEYS);
}

/**
 * Scheduled trigger — runs daily at 09:00 America/New_York. Charges every
 * installment whose due date has arrived.
 */
export const chargeMusicTogetherInstallments = onSchedule(
  {
    schedule: '0 9 * * *',
    timeZone: TIMEZONE,
    region: 'us-east4',
    secrets: mtSecretParams,
  },
  async () => {
    await runDueInstallmentCharges(new Date(), buildMtSquare());
  }
);

/**
 * Admin-callable manual trigger — same logic on demand, with an optional dry
 * run. Exists for manual catch-up if the schedule misfires, and because
 * `onSchedule` triggers aren't reachable over HTTP in the Firebase emulator
 * (so integration tests go through this).
 */
export const triggerMusicTogetherInstallments = Functions.endpoint
  .requiringRole(Role.Admin)
  .usingSecrets(...MT_SQUARE_SECRET_NAMES)
  .usingStrings(...MT_SQUARE_STRING_NAMES)
  .handle<
    ChargeMusicTogetherInstallmentsRequest,
    MusicTogetherInstallmentChargeResult
  >(async (data, _context, secrets, strings) => {
    const square = new Square(secrets, strings, MT_SQUARE_KEYS);
    return runDueInstallmentCharges(new Date(), square, {
      dryRun: data?.dryRun === true,
    });
  });
