/**
 * Cancel Registration Public Cloud Function
 *
 * Public endpoint (no auth required).
 * Allows customers to cancel their own registration using their
 * confirmation number and email. Automatically issues a refund
 * if a Square payment was made.
 *
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { Functions } from '@maple/firebase/functions';
import {
  RegistrationRepository,
  ClassRepository,
} from '@maple/firebase/database';
import {
  Square,
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
} from '@maple/firebase/square';
import { canRefundRegistration } from '@maple/ts/domain';
import type {
  CancelRegistrationPublicRequest,
  CancelRegistrationPublicResponse,
} from '@maple/ts/firebase/api-types';

/** Minimum hours before class start that cancellation is allowed */
const CANCELLATION_CUTOFF_HOURS = 48;

export const cancelRegistrationPublic = Functions.endpoint
  .usingSecrets(...SQUARE_SECRET_NAMES)
  .usingStrings(...SQUARE_STRING_NAMES)
  .handle<CancelRegistrationPublicRequest, CancelRegistrationPublicResponse>(
    async (data, _context, secrets, strings) => {
      if (!data.confirmationNumber || !data.customerEmail) {
        throw new Error('Confirmation number and email are required');
      }

      // Look up by confirmation number
      const registration =
        await RegistrationRepository.findByConfirmationNumber(
          data.confirmationNumber
        );

      // Don't reveal whether the confirmation number exists
      if (
        !registration ||
        registration.customerEmail.toLowerCase() !==
          data.customerEmail.toLowerCase()
      ) {
        throw new Error(
          'No registration found. Please check your confirmation number and email address.'
        );
      }

      // Check if already cancelled/refunded
      if (
        registration.status === 'cancelled' ||
        registration.status === 'refunded'
      ) {
        throw new Error(
          'This registration has already been cancelled.'
        );
      }

      // Check cancellation window — must be at least 48 hours before class
      const classEntity = await ClassRepository.findById(
        registration.classId
      );
      if (classEntity) {
        const classTime = new Date(classEntity.dateTime).getTime();
        const now = Date.now();
        const hoursUntilClass = (classTime - now) / (1000 * 60 * 60);

        if (hoursUntilClass < CANCELLATION_CUTOFF_HOURS) {
          throw new Error(
            `Cancellations must be made at least ${CANCELLATION_CUTOFF_HOURS} hours before the class starts. Please contact us at katie@mapleandsprucefolkarts.com for assistance.`
          );
        }
      }

      // Process refund if payment exists
      let refundId: string | undefined;
      const refundAmountCents = registration.pricePaidCents;

      if (
        registration.squarePaymentId &&
        refundAmountCents > 0 &&
        canRefundRegistration(registration)
      ) {
        const square = new Square(
          secrets as typeof secrets &
            Record<(typeof SQUARE_SECRET_NAMES)[number], string>,
          strings as typeof strings &
            Record<(typeof SQUARE_STRING_NAMES)[number], string>
        );

        const refundResult = await square.paymentsService.refundPayment({
          paymentId: registration.squarePaymentId,
          amountCents: refundAmountCents,
          idempotencyKey: `refund-public-${registration.id}-${Date.now()}`,
          reason: data.reason || 'Cancelled by customer',
        });

        refundId = refundResult.refundId;
      }

      // Update registration status
      const newStatus = refundId ? 'refunded' : 'cancelled';
      const updated = await RegistrationRepository.update({
        id: registration.id,
        status: newStatus,
      });

      return {
        registration: updated,
        refundAmountCents,
        refundId,
      };
    }
  );
