/**
 * Update Discount Cloud Function
 *
 * Updates an existing discount code.
 * Admin-only endpoint.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { DiscountRepository } from '@maple/firebase/database';
import type {
  UpdateDiscountRequest,
  UpdateDiscountResponse,
} from '@maple/ts/firebase/api-types';

export const updateDiscount = createAdminFunction<
  UpdateDiscountRequest,
  UpdateDiscountResponse
>(async (data) => {
  if (!data.id) {
    throw new Error('Discount ID is required');
  }

  // Check if discount exists
  const existing = await DiscountRepository.findById(data.id);
  if (!existing) {
    throw new Error(`Discount not found: ${data.id}`);
  }

  // If code is changing, check for uniqueness
  if (data.code && data.code.toUpperCase() !== existing.code) {
    const codeExists = await DiscountRepository.findByCode(data.code);
    if (codeExists) {
      throw new Error(
        `Discount code "${data.code.toUpperCase()}" already exists`
      );
    }
  }

  const discount = await DiscountRepository.update(data);

  return { discount };
});
