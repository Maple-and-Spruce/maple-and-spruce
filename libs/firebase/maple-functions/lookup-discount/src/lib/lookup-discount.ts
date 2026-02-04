/**
 * Lookup Discount Cloud Function
 *
 * Looks up a discount by code and returns it if active.
 * Public endpoint (no auth required) - used by the checkout form.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createPublicFunction } from '@maple/firebase/functions';
import { DiscountRepository } from '@maple/firebase/database';
import { isDiscountValid } from '@maple/ts/domain';
import type {
  LookupDiscountRequest,
  LookupDiscountResponse,
} from '@maple/ts/firebase/api-types';

export const lookupDiscount = createPublicFunction<
  LookupDiscountRequest,
  LookupDiscountResponse
>(async (data) => {
  if (!data.code || typeof data.code !== 'string') {
    return { discount: undefined };
  }

  const discount = await DiscountRepository.findByCode(data.code);

  if (!discount || !isDiscountValid(discount)) {
    return { discount: undefined };
  }

  return { discount };
});
