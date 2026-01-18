/**
 * Get Product Cloud Function
 *
 * Retrieves a single product by ID.
 */
import { createAuthenticatedFunction, throwNotFound } from '@maple/firebase/functions';
import { ProductRepository } from '@maple/firebase/database';
import type {
  GetProductRequest,
  GetProductResponse,
} from '@maple/ts/firebase/api-types';

export const getProduct = createAuthenticatedFunction<
  GetProductRequest,
  GetProductResponse
>(async (data) => {
  const product = await ProductRepository.findById(data.id);

  if (!product) {
    throwNotFound('Product', data.id);
  }

  return { product };
});
