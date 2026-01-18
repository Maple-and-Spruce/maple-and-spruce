/**
 * Update Product Cloud Function
 *
 * Updates an existing product (admin only).
 */
import { createAdminFunction, throwNotFound } from '@maple/firebase/functions';
import { ProductRepository } from '@maple/firebase/database';
import { productValidation } from '@maple/ts/validation';
import type {
  UpdateProductRequest,
  UpdateProductResponse,
} from '@maple/ts/firebase/api-types';

export const updateProduct = createAdminFunction<
  UpdateProductRequest,
  UpdateProductResponse
>(async (data) => {
  // Check product exists
  const existing = await ProductRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Product', data.id);
  }

  // Validate update data (merge with existing for full validation)
  const merged = { ...existing, ...data };
  const validationResult = productValidation(merged);
  if (!validationResult.isValid()) {
    const errors = validationResult.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  const product = await ProductRepository.update(data);

  return { product };
});
