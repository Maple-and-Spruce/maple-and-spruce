/**
 * Delete Product Cloud Function
 *
 * Deletes a product (admin only).
 */
import {
  createRoleFunction,
  throwNotFound,
  Role,
} from '@maple/firebase/functions';
import { ProductRepository } from '@maple/firebase/database';
import type {
  DeleteProductRequest,
  DeleteProductResponse,
} from '@maple/ts/firebase/api-types';

export const deleteProduct = createRoleFunction<
  DeleteProductRequest,
  DeleteProductResponse
>(async (data) => {
  // Check product exists
  const existing = await ProductRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Product', data.id);
  }

  await ProductRepository.delete(data.id);

  return { success: true };
}, [Role.Admin, Role.Clerk]);
