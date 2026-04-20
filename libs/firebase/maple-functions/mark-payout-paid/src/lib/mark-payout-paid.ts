/**
 * Mark Payout Paid Cloud Function (#313)
 *
 * Admin callable. Updates a pending payout to 'paid' status with
 * payment method and optional reference.
 */
import {
  createAdminFunction,
  throwInvalidArgument,
  throwNotFound,
  throwFailedPrecondition,
} from '@maple/firebase/functions';
import { PayoutRepository } from '@maple/firebase/database';
import type {
  MarkPayoutPaidRequest,
  MarkPayoutPaidResponse,
} from '@maple/ts/firebase/api-types';

export const markPayoutPaid = createAdminFunction<
  MarkPayoutPaidRequest,
  MarkPayoutPaidResponse
>(async (data) => {
  if (!data.payoutId) {
    throwInvalidArgument('Payout ID is required');
  }
  if (!data.paymentMethod) {
    throwInvalidArgument('Payment method is required');
  }

  const existing = await PayoutRepository.findById(data.payoutId);
  if (!existing) {
    throwNotFound('Payout', data.payoutId);
  }

  if (existing.status !== 'pending') {
    throwFailedPrecondition(
      `Payout is already marked as '${existing.status}'`
    );
  }

  const payout = await PayoutRepository.markAsPaid(
    data.payoutId,
    data.paymentMethod,
    data.paymentReference
  );

  return { payout };
});
