/**
 * Firebase Cloud Functions entry point
 *
 * All functions are exported from their individual libraries and re-exported here.
 * This file serves as the main entry point for Firebase Functions deployment.
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

// Artist CRUD functions
export {
  getArtists,
  getArtist,
  createArtist,
  updateArtist,
  deleteArtist,
} from '@maple/firebase/maple-functions/artist';

// Product CRUD functions
export {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
} from '@maple/firebase/maple-functions/product';
