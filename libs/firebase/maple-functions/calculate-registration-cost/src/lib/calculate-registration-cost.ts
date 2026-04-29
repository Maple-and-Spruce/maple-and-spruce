/**
 * Calculate Registration Cost Cloud Function
 *
 * Calculates the total cost for a registration, applying any discount codes
 * and WV sales tax. Public endpoint (no auth required) - used by the checkout
 * form for live pricing.
 *
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { Functions } from '@maple/firebase/functions';
import { ClassRepository, DiscountRepository } from '@maple/firebase/database';
import {
  isClassRegistrationOpen,
  applyDiscount,
  isDiscountValid,
  formatDiscount,
  calculateTax,
} from '@maple/ts/domain';
import type {
  CalculateRegistrationCostRequest,
  CalculateRegistrationCostResponse,
} from '@maple/ts/firebase/api-types';
import { SQUARE_STRING_NAMES } from '@maple/firebase/square';

export const calculateRegistrationCost = Functions.endpoint
  .usingStrings(...SQUARE_STRING_NAMES)
  .handle<CalculateRegistrationCostRequest, CalculateRegistrationCostResponse>(
    async (data, _context, _secrets, strings) => {
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
          const result = applyDiscount(discount, {
            unitPriceCents: classEntity.priceCents,
            quantity: data.quantity,
          });
          discountAmountCents = result.discountAmountCents;
          discountDescription = formatDiscount(discount);
        }
        // If discount not found or invalid, silently ignore (no error)
        // The UI will show no discount applied
      }

      const finalCostCents = Math.max(0, originalCostCents - discountAmountCents);

      // Calculate sales tax
      const taxRatePercent = parseFloat(strings.SALES_TAX_RATE);
      const { taxAmountCents, totalCents } = calculateTax(
        finalCostCents,
        taxRatePercent
      );

      return {
        originalCostCents,
        discountAmountCents,
        finalCostCents,
        taxRatePercent,
        taxAmountCents,
        totalCents,
        discountDescription,
      };
    }
  );
