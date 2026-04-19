/**
 * Update Discount Cloud Function
 *
 * Updates an existing discount code.
 * Admin-only endpoint.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  createAdminFunction,
  throwInvalidArgument,
  throwNotFound,
  throwValidationError,
} from '@maple/firebase/functions';
import { DiscountRepository } from '@maple/firebase/database';
import { discountValidation } from '@maple/ts/validation';
import type {
  UpdateDiscountRequest,
  UpdateDiscountResponse,
} from '@maple/ts/firebase/api-types';

export const updateDiscount = createAdminFunction<
  UpdateDiscountRequest,
  UpdateDiscountResponse
>(async (data) => {
  if (!data.id) {
    throwInvalidArgument('Discount ID is required');
  }

  const existing = await DiscountRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Discount', data.id);
  }

  const fields = Object.keys(data).filter((key) => key !== 'id');
  if (fields.length > 0) {
    const result = discountValidation({ ...existing, ...data }, fields);
    if (result.hasErrors()) {
      throwValidationError(result.getErrors());
    }
  }

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
