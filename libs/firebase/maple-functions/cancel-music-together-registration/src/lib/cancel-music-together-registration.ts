/**
 * Cancel Music Together Registration Cloud Function (admin, MT Square account)
 *
 * Admin-only cancellation from the roster. Issues a Square refund — the
 * program's policy amount by default, or an admin-chosen partial/full amount —
 * and, critically, flips the family's scheduled installment charges to
 * `cancelled` so the Week-5 auto-charge job never runs them (the cancel-guard
 * layer of the overcharge-safety model).
 *
 * Refund amount:
 *   - `refundCents` omitted → program policy: amount paid at registration minus
 *     the $25 fee before the first class; non-refundable on/after. This is also
 *     the amount a customer self-service cancellation would use.
 *   - `refundCents` provided → that exact amount (admin discretion), validated
 *     to be an integer in [0, total captured] BEFORE any Square write.
 *
 * "Total captured" is the registration-time charge plus any installments
 * already paid. A partial/full refund is allocated greedily across those
 * captured payments (Square refunds are per-payment), so a refund can span the
 * registration charge and a paid installment. Not-yet-charged scheduled charges
 * are never "refunded" — they are cancelled so they never run.
 *
 * Refund routes to MT's separate Square account (MT_SQUARE_KEYS).
 * Deployed to us-east4 via CI/CD (maple-square codebase).
 */
import {
  Functions,
  Role,
  throwInvalidArgument,
  throwNotFound,
  throwFailedPrecondition,
} from '@maple/firebase/functions';
import {
  Square,
  MT_SQUARE_SECRET_NAMES,
  MT_SQUARE_STRING_NAMES,
  MT_SQUARE_KEYS,
} from '@maple/firebase/square';
import {
  MusicTogetherRegistrationRepository,
  MusicTogetherSectionRepository,
  MusicTogetherScheduledChargeRepository,
} from '@maple/firebase/database';
import {
  mtRefundCents,
  mtSectionFirstSessionAt,
  mtTotalCapturedCents,
  mtAllocateRefund,
  type MtCapturedPayment,
} from '@maple/ts/domain';
import type {
  CancelMusicTogetherRegistrationRequest,
  CancelMusicTogetherRegistrationResponse,
} from '@maple/ts/firebase/api-types';

export const cancelMusicTogetherRegistration = Functions.endpoint
  .usingSecrets(...MT_SQUARE_SECRET_NAMES)
  .usingStrings(...MT_SQUARE_STRING_NAMES)
  .requiringRole([Role.Admin, Role.MtTeacher])
  .handle<
    CancelMusicTogetherRegistrationRequest,
    CancelMusicTogetherRegistrationResponse
  >(async (data, _context, secrets, strings) => {
    if (!data.registrationId) {
      throwInvalidArgument('Registration ID is required');
    }

    const registration = await MusicTogetherRegistrationRepository.findById(
      data.registrationId
    );
    if (!registration) {
      throwNotFound('Music Together registration', data.registrationId);
    }
    if (
      registration.status === 'cancelled' ||
      registration.status === 'refunded'
    ) {
      throwFailedPrecondition(
        `Registration is already ${registration.status}`
      );
    }

    // All charges for this registration — needed both to compute what's been
    // captured (paid installments are refundable) and, later, to cancel the
    // still-scheduled ones (the cancel-guard).
    const charges =
      await MusicTogetherScheduledChargeRepository.findByRegistrationId(
        data.registrationId
      );

    // Captured payments a refund can draw against, in order: the
    // registration-time charge first, then paid installments by installment
    // number. Refunds allocate greedily across these.
    const paidCharges = charges
      .filter((c) => c.status === 'paid' && !!c.squarePaymentId)
      .sort((a, b) => a.installmentNumber - b.installmentNumber);
    const capturedPayments: MtCapturedPayment[] = [];
    if (registration.squarePaymentId) {
      capturedPayments.push({
        squarePaymentId: registration.squarePaymentId,
        amountCents: registration.pricePaidCents,
      });
    }
    for (const charge of paidCharges) {
      capturedPayments.push({
        squarePaymentId: charge.squarePaymentId as string,
        amountCents: charge.amountCents,
      });
    }
    const totalCaptured = mtTotalCapturedCents(capturedPayments);

    // Resolve the refund amount. Validate BEFORE any Square write so an invalid
    // amount never reaches the payments API.
    let requestedRefundCents: number;
    if (data.refundCents === undefined) {
      // Policy default (also the customer self-service amount).
      const section = await MusicTogetherSectionRepository.findById(
        registration.sectionId
      );
      const firstClassAt = section
        ? mtSectionFirstSessionAt(section)
        : undefined;
      // Policy is based on the registration-time charge; clamp to what's
      // actually captured for safety.
      requestedRefundCents = Math.min(
        mtRefundCents(registration.pricePaidCents, firstClassAt, new Date()),
        totalCaptured
      );
    } else {
      if (!Number.isInteger(data.refundCents) || data.refundCents < 0) {
        throwInvalidArgument(
          'Refund amount must be a non-negative whole number of cents'
        );
      }
      if (data.refundCents > totalCaptured) {
        throwInvalidArgument(
          `Refund amount (${data.refundCents}¢) exceeds the amount captured (${totalCaptured}¢)`
        );
      }
      requestedRefundCents = data.refundCents;
    }

    // Issue the refund(s), allocated across the captured payments.
    const allocations = mtAllocateRefund(
      capturedPayments,
      requestedRefundCents
    );
    const refundIds: string[] = [];
    let refundedCents = 0;
    if (allocations.length > 0) {
      const square = new Square(secrets, strings, MT_SQUARE_KEYS);
      for (const allocation of allocations) {
        // Stable idempotency key so a retried cancel returns the original
        // refund instead of refunding again. Keyed by payment: the
        // registration charge keeps the historical `mtrefund-<regId>` key;
        // installment payments get a per-payment key.
        const idempotencyKey =
          allocation.squarePaymentId === registration.squarePaymentId
            ? `mtrefund-${data.registrationId}`
            : `mtrefund-${data.registrationId}-${allocation.squarePaymentId}`;
        const refund = await square.paymentsService.refundPayment({
          paymentId: allocation.squarePaymentId,
          amountCents: allocation.amountCents,
          idempotencyKey,
          reason: 'Music Together registration cancelled',
        });
        refundIds.push(refund.refundId);
        refundedCents += allocation.amountCents;
      }
    }

    // Cancel any still-scheduled future charges so the auto-charge job skips
    // them. Already-paid/failed charges are left as-is for the record.
    let cancelledChargeCount = 0;
    for (const charge of charges) {
      if (charge.status === 'scheduled') {
        await MusicTogetherScheduledChargeRepository.update({
          id: charge.id,
          status: 'cancelled',
          resolvedAt: new Date(),
        });
        cancelledChargeCount++;
      }
    }

    const status = refundIds.length > 0 ? 'refunded' : 'cancelled';
    await MusicTogetherRegistrationRepository.update({
      id: data.registrationId,
      status,
    });

    return {
      registrationId: data.registrationId,
      status,
      refundCents: refundedCents,
      refundId: refundIds[0],
      refundIds: refundIds.length > 0 ? refundIds : undefined,
      cancelledChargeCount,
    };
  });
