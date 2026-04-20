/**
 * Firebase Cloud Functions — Square Integration Codebase
 *
 * This codebase contains functions that depend on the Square SDK
 * for payment processing, catalog management, and sync conflict resolution.
 * Separated to isolate the heavy Square SDK dependency from other functions,
 * reducing cold start times.
 */
import admin from 'firebase-admin';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

// Product write operations (Square catalog sync)
export { createProduct } from '@maple/firebase/maple-functions/create-product';
export { updateProduct } from '@maple/firebase/maple-functions/update-product';
export { uploadProductImage } from '@maple/firebase/maple-functions/upload-product-image';

// Square webhook (HTTP endpoint, not callable)
export { squareWebhook } from '@maple/firebase/maple-functions/square-webhook';

// Registration operations (Square payments)
export { createRegistration } from '@maple/firebase/maple-functions/create-registration';
export { cancelRegistration } from '@maple/firebase/maple-functions/cancel-registration';

// Sync conflict resolution (Square catalog comparison)
export { detectSyncConflicts } from '@maple/firebase/maple-functions/detect-sync-conflicts';
export { resolveSyncConflict } from '@maple/firebase/maple-functions/resolve-sync-conflict';

// Invoice → Square sync (Firestore trigger on invoices/{id})
export { syncInvoiceToSquare } from '@maple/firebase/maple-functions/sync-invoice-to-square';

// Etsy listing import (pull-only; creates Square catalog items for imported listings)
export { importEtsyListings } from '@maple/firebase/maple-functions/import-etsy-listings';

// Cross-channel inventory sync (Square)
export { syncInventoryToSquare } from '@maple/firebase/maple-functions/sync-inventory-to-square';
