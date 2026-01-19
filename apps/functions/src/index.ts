/**
 * Firebase Cloud Functions entry point
 *
 * All functions are exported from their individual libraries and re-exported here.
 * This file serves as the main entry point for Firebase Functions deployment.
 *
 * Each function is in its own library to enable granular CI/CD deployment.
 * When a function library changes, only that function gets redeployed.
 */
import { createPublicFunction } from '@maple/firebase/functions';

// Health check for testing
export const healthCheck = createPublicFunction<
  Record<string, never>,
  { status: string; timestamp: string }
>(async () => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
});

// Artist functions
export { getArtists } from '@maple/firebase/maple-functions/get-artists';
export { getArtist } from '@maple/firebase/maple-functions/get-artist';
export { createArtist } from '@maple/firebase/maple-functions/create-artist';
export { updateArtist } from '@maple/firebase/maple-functions/update-artist';
export { deleteArtist } from '@maple/firebase/maple-functions/delete-artist';
export { uploadArtistImage } from '@maple/firebase/maple-functions/upload-artist-image';

// Product functions
export { getProducts } from '@maple/firebase/maple-functions/get-products';
export { getProduct } from '@maple/firebase/maple-functions/get-product';
export { createProduct } from '@maple/firebase/maple-functions/create-product';
export { updateProduct } from '@maple/firebase/maple-functions/update-product';
export { deleteProduct } from '@maple/firebase/maple-functions/delete-product';
export { uploadProductImage } from '@maple/firebase/maple-functions/upload-product-image';

// Square webhook (HTTP endpoint, not callable)
export { squareWebhook } from '@maple/firebase/maple-functions/square-webhook';
