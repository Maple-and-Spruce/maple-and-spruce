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

// Public API (no auth required - for Webflow integration)
export { getPublicArtists } from '@maple/firebase/maple-functions/get-public-artists';

// Category functions
export { getCategories } from '@maple/firebase/maple-functions/get-categories';
export { createCategory } from '@maple/firebase/maple-functions/create-category';
export { updateCategory } from '@maple/firebase/maple-functions/update-category';
export { deleteCategory } from '@maple/firebase/maple-functions/delete-category';
export { reorderCategories } from '@maple/firebase/maple-functions/reorder-categories';

// Product functions
export { getProducts } from '@maple/firebase/maple-functions/get-products';
export { getProduct } from '@maple/firebase/maple-functions/get-product';
export { createProduct } from '@maple/firebase/maple-functions/create-product';
export { updateProduct } from '@maple/firebase/maple-functions/update-product';
export { deleteProduct } from '@maple/firebase/maple-functions/delete-product';
export { uploadProductImage } from '@maple/firebase/maple-functions/upload-product-image';

// Square webhook (HTTP endpoint, not callable)
export { squareWebhook } from '@maple/firebase/maple-functions/square-webhook';

// Webflow CMS sync (Firestore triggers)
export { syncArtistToWebflow } from '@maple/maple-functions/sync-artist-to-webflow';

// Sync conflict functions
export { getSyncConflicts } from '@maple/firebase/maple-functions/get-sync-conflicts';
export { getSyncConflictSummary } from '@maple/firebase/maple-functions/get-sync-conflict-summary';
export { resolveSyncConflict } from '@maple/firebase/maple-functions/resolve-sync-conflict';
export { detectSyncConflicts } from '@maple/firebase/maple-functions/detect-sync-conflicts';

// Instructor functions
export { getInstructors } from '@maple/firebase/maple-functions/get-instructors';
export { getInstructor } from '@maple/firebase/maple-functions/get-instructor';
export { createInstructor } from '@maple/firebase/maple-functions/create-instructor';
export { updateInstructor } from '@maple/firebase/maple-functions/update-instructor';
export { deleteInstructor } from '@maple/firebase/maple-functions/delete-instructor';

// Class functions
export { getClasses } from '@maple/firebase/maple-functions/get-classes';
export { getClass } from '@maple/firebase/maple-functions/get-class';
export { createClass } from '@maple/firebase/maple-functions/create-class';
export { updateClass } from '@maple/firebase/maple-functions/update-class';
export { deleteClass } from '@maple/firebase/maple-functions/delete-class';
export { uploadClassImage } from '@maple/firebase/maple-functions/upload-class-image';

// Public class API (no auth required - for Webflow integration)
export { getPublicClasses } from '@maple/firebase/maple-functions/get-public-classes';
export { getPublicClass } from '@maple/firebase/maple-functions/get-public-class';

// Class category functions
export { getClassCategories } from '@maple/firebase/maple-functions/get-class-categories';

// Discount functions
export { getDiscounts } from '@maple/firebase/maple-functions/get-discounts';
export { createDiscount } from '@maple/firebase/maple-functions/create-discount';
export { updateDiscount } from '@maple/firebase/maple-functions/update-discount';
export { deleteDiscount } from '@maple/firebase/maple-functions/delete-discount';
export { lookupDiscount } from '@maple/firebase/maple-functions/lookup-discount';

// Registration functions
export { getRegistrations } from '@maple/firebase/maple-functions/get-registrations';
export { getRegistration } from '@maple/firebase/maple-functions/get-registration';
export { updateRegistration } from '@maple/firebase/maple-functions/update-registration';
export { calculateRegistrationCost } from '@maple/firebase/maple-functions/calculate-registration-cost';
export { createRegistration } from '@maple/firebase/maple-functions/create-registration';
export { cancelRegistration } from '@maple/firebase/maple-functions/cancel-registration';
