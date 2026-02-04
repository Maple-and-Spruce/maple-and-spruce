/**
 * Delete Discount Cloud Function
 *
 * Deletes an existing discount code.
 * Admin-only endpoint.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { DiscountRepository } from '@maple/firebase/database';
import type {
  DeleteDiscountRequest,
  DeleteDiscountResponse,
} from '@maple/ts/firebase/api-types';

export const deleteDiscount = createAdminFunction<
  DeleteDiscountRequest,
  DeleteDiscountResponse
>(async (data) => {
  if (!data.id) {
    throw new Error('Discount ID is required');
  }

  // Check if discount exists
  const existing = await DiscountRepository.findById(data.id);
  if (!existing) {
    throw new Error(`Discount not found: ${data.id}`);
  }

  await DiscountRepository.delete(data.id);

  return { success: true };
});
