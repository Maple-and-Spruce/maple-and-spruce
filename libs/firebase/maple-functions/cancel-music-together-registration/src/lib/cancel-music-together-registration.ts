/**
 * Cancel Music Together Registration Cloud Function (admin, MT Square account)
 *
 * Admin-only cancellation from the roster. Applies the program's refund policy
 * and — critically — flips the family's scheduled installment charges to
 * `cancelled` so the Week-5 auto-charge job never runs them (the cancel-guard
 * layer of the overcharge-safety model).
 *
 * Refund policy:
 *   - BEFORE the first class → amount paid at registration minus the $25 fee.
 *   - ON/AFTER the first class → non-refundable.
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
import { mtRefundCents, mtSectionFirstSessionAt } from '@maple/ts/domain';
import type {
  CancelMusicTogetherRegistrationRequest,
  CancelMusicTogetherRegistrationResponse,
} from '@maple/ts/firebase/api-types';

export const cancelMusicTogetherRegistration = Functions.endpoint
  .usingSecrets(...MT_SQUARE_SECRET_NAMES)
  .usingStrings(...MT_SQUARE_STRING_NAMES)
  .requiringRole(Role.Admin)
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

    // Determine the refund from the program policy (section first-class date).
    const section = await MusicTogetherSectionRepository.findById(
      registration.sectionId
    );
    const firstClassAt = section
      ? mtSectionFirstSessionAt(section)
      : undefined;
    const refundCents = mtRefundCents(
      registration.pricePaidCents,
      firstClassAt,
      new Date()
    );

    // Issue the refund (if any) against the registration-time payment.
    let refundId: string | undefined;
    if (refundCents > 0 && registration.squarePaymentId) {
      const square = new Square(secrets, strings, MT_SQUARE_KEYS);
      const refund = await square.paymentsService.refundPayment({
        paymentId: registration.squarePaymentId,
        amountCents: refundCents,
        // Stable key — a retried cancel returns the original refund.
        idempotencyKey: `mtrefund-${data.registrationId}`,
        reason: 'Music Together registration cancelled',
      });
      refundId = refund.refundId;
    }

    // Cancel any still-scheduled future charges so the auto-charge job skips
    // them. Already-paid/failed charges are left as-is for the record.
    const charges =
      await MusicTogetherScheduledChargeRepository.findByRegistrationId(
        data.registrationId
      );
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

    const status = refundId ? 'refunded' : 'cancelled';
    await MusicTogetherRegistrationRepository.update({
      id: data.registrationId,
      status,
    });

    return {
      registrationId: data.registrationId,
      status,
      refundCents: refundId ? refundCents : 0,
      refundId,
      cancelledChargeCount,
    };
  });
