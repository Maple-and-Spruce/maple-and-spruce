/**
 * Get Payouts Cloud Function (#313)
 *
 * Admin callable. Returns artist payouts with optional filters.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { PayoutRepository } from '@maple/firebase/database';
import type {
  GetPayoutsRequest,
  GetPayoutsResponse,
} from '@maple/ts/firebase/api-types';

export const getPayouts = createAdminFunction<
  GetPayoutsRequest,
  GetPayoutsResponse
>(async (data) => {
  const payouts = await PayoutRepository.findAll({
    artistId: data.artistId,
    status: data.status,
  });

  return { payouts };
});
