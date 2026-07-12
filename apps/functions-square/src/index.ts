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

// Async catalog sync worker (Firestore-triggered, debounced via lease).
// Decoupled from squareWebhook so the webhook can ack within Square's
// 10-second delivery deadline; the heavy O(catalog) sync runs here.
export { processCatalogSyncRequest } from '@maple/firebase/maple-functions/process-catalog-sync-request';

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

// Craft Club subscription signup (public; Square customer + card + subscription)
export { createCraftClubSubscription } from '@maple/firebase/maple-functions/create-craft-club-subscription';

// Music Together public checkout (routes to MT's separate Square account)
export { createMusicTogetherRegistration } from '@maple/firebase/maple-functions/create-music-together-registration';
export { cancelMusicTogetherRegistration } from '@maple/firebase/maple-functions/cancel-music-together-registration';

// Music Together Week-5 auto-charge job (scheduled + admin-callable trigger)
export {
  chargeMusicTogetherInstallments,
  triggerMusicTogetherInstallments,
} from '@maple/firebase/maple-functions/charge-music-together-installments';
// Craft Club self-service (public, session-gated; Square subscription mutations)
export { cancelCraftClubSubscription } from '@maple/firebase/maple-functions/cancel-craft-club-subscription';
export { updateCraftClubPaymentMethod } from '@maple/firebase/maple-functions/update-craft-club-payment-method';
// Craft Club admin lifecycle (admin-only; Square pause/resume/cancel)
export { adminPauseCraftClubSubscription } from '@maple/firebase/maple-functions/admin-pause-craft-club-subscription';
export { adminResumeCraftClubSubscription } from '@maple/firebase/maple-functions/admin-resume-craft-club-subscription';
export { adminCancelCraftClubSubscription } from '@maple/firebase/maple-functions/admin-cancel-craft-club-subscription';

// Class → Square catalog sync (Firestore trigger on classes/{id})
// Mirrors a published class as a Square catalog item + variation + required
// modifier list so it can be rung up on POS in person.
export { syncClassToSquare } from '@maple/firebase/maple-functions/sync-class-to-square';

// Class registration → Square inventory sync (Firestore trigger on
// registrations/{id}). Mirrors remaining seats (capacity - count) to the
// class's Square variation via idempotent PHYSICAL_COUNT so POS stock stays
// accurate as web registrations happen.
export { syncClassInventoryToSquare } from '@maple/firebase/maple-functions/sync-class-inventory-to-square';
