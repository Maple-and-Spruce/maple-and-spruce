/**
 * Cancel Registration Cloud Function
 *
 * Admin-only endpoint for cancelling a registration with optional Square refund.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { Functions, Role } from '@maple/firebase/functions';
import { RegistrationRepository } from '@maple/firebase/database';
import {
  Square,
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
} from '@maple/firebase/square';
import { canRefundRegistration } from '@maple/ts/domain';
import type {
  CancelRegistrationRequest,
  CancelRegistrationResponse,
} from '@maple/ts/firebase/api-types';

export const cancelRegistration = Functions.endpoint
  .usingSecrets(...SQUARE_SECRET_NAMES)
  .usingStrings(...SQUARE_STRING_NAMES)
  .requiringRole(Role.Admin)
  .handle<CancelRegistrationRequest, CancelRegistrationResponse>(
    async (data, _context, secrets, strings) => {
      if (!data.id) {
        throw new Error('Registration ID is required');
      }

      // Look up the registration
      const registration = await RegistrationRepository.findById(data.id);
      if (!registration) {
        throw new Error(`Registration not found: ${data.id}`);
      }

      // Check if already cancelled/refunded
      if (
        registration.status === 'cancelled' ||
        registration.status === 'refunded'
      ) {
        throw new Error(
          `Registration is already ${registration.status}`
        );
      }

      let refundId: string | undefined;

      // Process refund if requested and payment exists
      if (data.refund && registration.squarePaymentId) {
        if (!canRefundRegistration(registration)) {
          throw new Error(
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
      }

      // Update registration status
      const newStatus = data.refund && refundId ? 'refunded' : 'cancelled';
      const updated = await RegistrationRepository.update({
        id: data.id,
        status: newStatus,
      });

      return {
        registration: updated,
        refundId,
      };
    }
  );
