/**
 * Firebase Cloud Functions — Webflow Sync Codebase
 *
 * This codebase contains the Webflow CMS sync function.
 * Separated to isolate the Webflow API dependency from other functions,
 * reducing cold start times.
 */
import admin from 'firebase-admin';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

// Webflow CMS sync (Firestore triggers)
export { syncArtistToWebflow } from '@maple/firebase/maple-functions/sync-artist-to-webflow';
export { syncClassToWebflow } from '@maple/firebase/maple-functions/sync-class-to-webflow';
export { syncRegistrationCount } from '@maple/firebase/maple-functions/sync-registration-count';
export { syncInstructorToWebflow } from '@maple/firebase/maple-functions/sync-instructor-to-webflow';
export { syncMusicTogetherSectionToWebflow } from '@maple/firebase/maple-functions/sync-music-together-section-to-webflow';

// Etsy OAuth bootstrap
export { etsyAuthUrl } from '@maple/firebase/maple-functions/etsy-auth-url';
export { etsyAuthCallback } from '@maple/firebase/maple-functions/etsy-auth-callback';
export { getEtsyConnectionStatus } from '@maple/firebase/maple-functions/get-etsy-connection-status';
export { refreshEtsyShopId } from '@maple/firebase/maple-functions/refresh-etsy-shop-id';

// Etsy push (catalog → Etsy)
export { pushProductToEtsy } from '@maple/firebase/maple-functions/push-product-to-etsy';
export { updateEtsyListing } from '@maple/firebase/maple-functions/update-etsy-listing';

// Etsy order polling + inventory sync
export { pollEtsyOrders } from '@maple/firebase/maple-functions/poll-etsy-orders';
export { syncInventoryToEtsy } from '@maple/firebase/maple-functions/sync-inventory-to-etsy';
