/**
 * Create Product Cloud Function
 *
 * Creates a new product (admin only).
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { ProductRepository } from '@maple/firebase/database';
import { productValidation } from '@maple/ts/validation';
import type {
  CreateProductRequest,
  CreateProductResponse,
} from '@maple/ts/firebase/api-types';

export const createProduct = createAdminFunction<
  CreateProductRequest,
  CreateProductResponse
>(async (data) => {
  // Validate input
  const validationResult = productValidation(data);
  if (!validationResult.isValid()) {
    const errors = validationResult.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  const product = await ProductRepository.create(data);

  return { product };
});
