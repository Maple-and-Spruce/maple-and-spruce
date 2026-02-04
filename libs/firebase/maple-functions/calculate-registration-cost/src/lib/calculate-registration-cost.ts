/**
 * Calculate Registration Cost Cloud Function
 *
 * Calculates the total cost for a registration, applying any discount codes.
 * Public endpoint (no auth required) - used by the checkout form for live pricing.
 *
 * Similar to Mountain Sol's calculateBasket function.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createPublicFunction } from '@maple/firebase/functions';
import { ClassRepository, DiscountRepository } from '@maple/firebase/database';
import {
  isClassRegistrationOpen,
  applyDiscount,
  isDiscountValid,
  formatDiscount,
} from '@maple/ts/domain';
import type {
  CalculateRegistrationCostRequest,
  CalculateRegistrationCostResponse,
} from '@maple/ts/firebase/api-types';

export const calculateRegistrationCost = createPublicFunction<
  CalculateRegistrationCostRequest,
  CalculateRegistrationCostResponse
>(async (data) => {
  if (!data.classId) {
    throw new Error('Class ID is required');
  }

  if (!data.quantity || data.quantity < 1) {
    throw new Error('Quantity must be at least 1');
  }

  // Look up the class
  const classEntity = await ClassRepository.findById(data.classId);
  if (!classEntity) {
    throw new Error(`Class not found: ${data.classId}`);
  }

  if (!isClassRegistrationOpen(classEntity)) {
    throw new Error('This class is not open for registration');
  }

  // Calculate base cost
  const originalCostCents = classEntity.priceCents * data.quantity;
  let discountAmountCents = 0;
  let discountDescription: string | undefined;

  // Apply discount if code provided
  if (data.discountCode) {
    const discount = await DiscountRepository.findByCode(data.discountCode);

    if (discount && isDiscountValid(discount)) {
      const result = applyDiscount(discount, originalCostCents);
      discountAmountCents = result.discountAmountCents;
      discountDescription = formatDiscount(discount);
    }
    // If discount not found or invalid, silently ignore (no error)
    // The UI will show no discount applied
  }

  const finalCostCents = originalCostCents - discountAmountCents;

  return {
    originalCostCents,
    discountAmountCents,
    finalCostCents: Math.max(0, finalCostCents),
    discountDescription,
  };
});
