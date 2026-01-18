/**
 * Get Products Cloud Function
 *
 * Retrieves all products, optionally filtered by artistId or status.
 */
import { createAuthenticatedFunction } from '@maple/firebase/functions';
import { ProductRepository } from '@maple/firebase/database';
import type {
  GetProductsRequest,
  GetProductsResponse,
} from '@maple/ts/firebase/api-types';

export const getProducts = createAuthenticatedFunction<
  GetProductsRequest,
  GetProductsResponse
>(async (data) => {
  const products = await ProductRepository.findAll({
    artistId: data.artistId,
    status: data.status,
  });

  return { products };
});
