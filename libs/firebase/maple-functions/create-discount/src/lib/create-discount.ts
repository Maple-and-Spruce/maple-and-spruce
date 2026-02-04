/**
 * Create Discount Cloud Function
 *
 * Creates a new discount code.
 * Validates input and checks for code uniqueness.
 * Admin-only endpoint.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { DiscountRepository } from '@maple/firebase/database';
import { discountValidation } from '@maple/ts/validation';
import type {
  CreateDiscountRequest,
  CreateDiscountResponse,
} from '@maple/ts/firebase/api-types';

export const createDiscount = createAdminFunction<
  CreateDiscountRequest,
  CreateDiscountResponse
>(async (data) => {
  // Validate input
  const result = discountValidation(data);
  if (!result.isValid()) {
    const errors = result.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  // Check for code uniqueness
  const existing = await DiscountRepository.findByCode(data.code);
  if (existing) {
    throw new Error(
      `Discount code "${data.code.toUpperCase()}" already exists`
    );
  }

  const discount = await DiscountRepository.create(data);

  return { discount };
});
