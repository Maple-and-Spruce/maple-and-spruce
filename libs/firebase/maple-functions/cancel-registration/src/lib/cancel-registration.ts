/**
 * Cancel Registration Cloud Function
 *
 * Admin-only endpoint for cancelling a registration with optional Square refund.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  Functions,
  Role,
  throwFailedPrecondition,
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import { RegistrationRepository } from '@maple/firebase/database';
import {
  Square,
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
} from '@maple/firebase/square';
import {
  canRefundRegistration,
  formatCentsAsDollars,
  registrationRefundParts,
  type Registration,
} from '@maple/ts/domain';
import type {
  CancelRegistrationRequest,
  CancelRegistrationResponse,
} from '@maple/ts/firebase/api-types';

export const cancelRegistration = Functions.endpoint
  .usingSecrets(...SQUARE_SECRET_NAMES)
  .usingStrings(...SQUARE_STRING_NAMES)
  .requiringRole([Role.Admin, Role.Clerk])
  .handle<CancelRegistrationRequest, CancelRegistrationResponse>(
    async (data, _context, secrets, strings) => {
      // The `registrationValidation` Vest suite covers registration form
      // fields (classId, customerName/Email/Phone, quantity, notes). None
      // of those are part of the cancel payload ({id, refund?}), so the
      // suite is not applicable here — the entity was already validated
      // when it was created. We keep narrow type/status guards instead.
      if (!data.id) {
        throwInvalidArgument('Registration ID is required');
      }
      for (const flag of ['refund', 'refundedInSquare'] as const) {
        if (data[flag] !== undefined && typeof data[flag] !== 'boolean') {
          throwInvalidArgument(`${flag} must be true or false`);
        }
      }
      if (data.refund && data.refundedInSquare) {
        throwInvalidArgument(
          'Choose either a refund or already refunded in Square, not both'
        );
      }

      // Look up the registration
      const registration = await RegistrationRepository.findById(data.id);
      if (!registration) {
        throwNotFound('Registration', data.id);
      }

      // Check if already cancelled/refunded
      if (
        registration.status === 'cancelled' ||
        registration.status === 'refunded'
      ) {
        throwFailedPrecondition(
          `Registration is already ${registration.status}`
        );
      }

      // Already refunded in the Square dashboard: record it, no Square call.
      if (data.refundedInSquare) {
        const updated = await RegistrationRepository.markRefundedInSquare(
          registration
        );
        return { registration: updated };
      }

      let refundId: string | undefined;
      let refundedAmountCents: number | undefined;

      // Paid partly or wholly by gift card (#301): refund each payment to
      // where it came from. A registration paid by card alone never has
      // `squareGiftCardPaymentId` and takes the original path below.
      if (data.refund && registration.squareGiftCardPaymentId) {
        if (!canRefundRegistration(registration)) {
          throwFailedPrecondition(
            `Cannot refund a registration with status '${registration.status}'`
          );
        }
        const square = new Square(
          secrets as typeof secrets &
            Record<(typeof SQUARE_SECRET_NAMES)[number], string>,
          strings as typeof strings &
            Record<(typeof SQUARE_STRING_NAMES)[number], string>
        );
        const result = await refundGiftCardRegistration(square, registration);
        const refundedAt = new Date();
        const updated = await RegistrationRepository.update({
          id: data.id,
          status: 'refunded',
          refundedAt,
          lastRefundAt: refundedAt,
          refundedAmountCents: result.refundedAmountCents,
          squareRefundId: result.refundIds[0],
          squareRefundIds: result.squareRefundIds,
        });
        return { registration: updated, refundId: result.refundIds[0] };
      }

      // Process refund if requested and payment exists
      if (data.refund && registration.squarePaymentId) {
        if (!canRefundRegistration(registration)) {
          throwFailedPrecondition(
            `Cannot refund a registration with status '${registration.status}'`
          );
        }

        const square = new Square(
          secrets as typeof secrets &
            Record<(typeof SQUARE_SECRET_NAMES)[number], string>,
          strings as typeof strings &
            Record<(typeof SQUARE_STRING_NAMES)[number], string>
        );

        const refundResult = await square.paymentsService.refundPayment({
          paymentId: registration.squarePaymentId,
          amountCents: registration.pricePaidCents,
          idempotencyKey: `refund-${data.id}-${Date.now()}`,
          reason: 'Registration cancelled by admin',
        });

        refundId = refundResult.refundId;
        refundedAmountCents = refundResult.amountCents || registration.pricePaidCents;
      }

      // Update registration status. The refund's time and amount are kept so
      // instructor payouts can tell a refund before a statement was paid from
      // one after. The id also goes in `squareRefundIds`, so Square's
      // `refund.*` webhook for this same refund is recognised as already
      // counted rather than added a second time.
      const refunded = Boolean(data.refund && refundId);
      const refundedAt = new Date();
      const updated = await RegistrationRepository.update({
        id: data.id,
        status: refunded ? 'refunded' : 'cancelled',
        ...(refunded &&
          refundId && {
            refundedAt,
            lastRefundAt: refundedAt,
            refundedAmountCents,
            squareRefundId: refundId,
            squareRefundIds: [...(registration.squareRefundIds ?? []), refundId],
          }),
      });

      return {
        registration: updated,
        refundId,
      };
    }
  );

/**
 * Refund a registration that a gift card paid for, in part or in full: the
 * card's share back to the card, the gift card's share back onto the gift
 * card. The studio-covered class certificate amount was never paid by anyone,
 * so it is not refunded.
 *
 * Idempotency keys are derived from the registration, so running it again
 * after a partial failure gets the same refunds back from Square rather than
 * refunding twice, and a refund already recorded is not counted twice.
 *
 * If one refund goes through and the next fails, what did go back is recorded
 * (the registration stays active) and the admin is told what is left to
 * refund by hand.
 */
async function refundGiftCardRegistration(
  square: Square,
  registration: Registration
): Promise<{
  refundIds: string[];
  squareRefundIds: string[];
  refundedAmountCents: number;
}> {
  const known = registration.squareRefundIds ?? [];
  const squareRefundIds = [...known];
  const refundIds: string[] = [];
  let refundedAmountCents = registration.refundedAmountCents ?? 0;

  for (const part of registrationRefundParts(registration)) {
    try {
      const refund = await square.paymentsService.refundPayment({
        paymentId: part.paymentId,
        amountCents: part.amountCents,
        idempotencyKey: `refund-${registration.id}-${part.kind}`,
        reason: 'Registration cancelled by admin',
      });
      refundIds.push(refund.refundId);
      if (!squareRefundIds.includes(refund.refundId)) {
        squareRefundIds.push(refund.refundId);
        refundedAmountCents += refund.amountCents || part.amountCents;
      }
    } catch (error) {
      if (squareRefundIds.length > known.length) {
        await RegistrationRepository.update({
          id: registration.id,
          refundedAmountCents,
          lastRefundAt: new Date(),
          squareRefundIds,
        });
      }
      const detail = error instanceof Error ? error.message : String(error);
      const where = part.kind === 'gift-card' ? 'gift card' : 'card';
      const done =
        refundIds.length > 0
          ? `${formatCentsAsDollars(refundedAmountCents)} has been refunded so far. `
          : '';
      throwFailedPrecondition(
        `${done}The ${formatCentsAsDollars(part.amountCents)} refund to the ${where} failed (${detail}). ` +
          'Try again, or refund it in Square and then mark the registration refunded in Square.'
      );
    }
  }

  return { refundIds, squareRefundIds, refundedAmountCents };
}
