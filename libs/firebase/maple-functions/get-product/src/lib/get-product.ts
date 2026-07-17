/**
 * Get Product Cloud Function
 *
 * Retrieves a single product by ID.
 */
import {
  createRoleFunction,
  throwNotFound,
  Role,
} from '@maple/firebase/functions';
import { ProductRepository } from '@maple/firebase/database';
import type {
  GetProductRequest,
  GetProductResponse,
} from '@maple/ts/firebase/api-types';

export const getProduct = createRoleFunction<
  GetProductRequest,
  GetProductResponse
>(async (data) => {
  const product = await ProductRepository.findById(data.id);

  if (!product) {
    throwNotFound('Product', data.id);
  }

  return { product };
}, [Role.Admin, Role.Clerk]);
