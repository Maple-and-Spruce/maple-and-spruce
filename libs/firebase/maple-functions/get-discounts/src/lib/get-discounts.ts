/**
 * Get Discounts Cloud Function
 *
 * Retrieves all discounts with optional status filter.
 * Admin-only endpoint.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { DiscountRepository } from '@maple/firebase/database';
import type {
  GetDiscountsRequest,
  GetDiscountsResponse,
} from '@maple/ts/firebase/api-types';

export const getDiscounts = createAdminFunction<
  GetDiscountsRequest,
  GetDiscountsResponse
>(async (data) => {
  const discounts = await DiscountRepository.findAll({
    status: data.status,
  });

  return { discounts };
});
