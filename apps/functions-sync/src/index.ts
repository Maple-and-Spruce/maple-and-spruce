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

// Webflow CMS sync (Firestore trigger)
export { syncArtistToWebflow } from '@maple/maple-functions/sync-artist-to-webflow';
