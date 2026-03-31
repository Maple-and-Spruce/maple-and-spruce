/**
 * Firebase Cloud Functions — Core Codebase (maple-core)
 *
 * This is the main codebase containing CRUD operations, auth, triggers,
 * and admin functions. Heavy dependencies (Square SDK, Webflow API,
 * ical-generator) are isolated in separate codebases to reduce cold starts.
 *
 * See also:
 * - apps/functions-calendar/ — ICS feed generation (ical-generator)
 * - apps/functions-square/  — Square integration (square SDK)
 * - apps/functions-sync/    — Webflow sync (webflow-api)
 */
import admin from 'firebase-admin';
import { createPublicFunction } from '@maple/firebase/functions';

// Initialize Firebase Admin at the entry point, before any function handlers run.
// This ensures the admin SDK is ready for Firestore triggers (onDocumentWritten)
// which can execute before lazy initialization in individual modules takes effect.
if (admin.apps.length === 0) {
  admin.initializeApp();
}

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

// Auth functions
export { checkAdminStatus } from '@maple/firebase/maple-functions/check-admin-status';

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

// Product functions (read/delete only — writes are in maple-square codebase)
export { getProducts } from '@maple/firebase/maple-functions/get-products';
export { getProduct } from '@maple/firebase/maple-functions/get-product';
export { deleteProduct } from '@maple/firebase/maple-functions/delete-product';

// Sync conflict functions (read-only — resolution is in maple-square codebase)
export { getSyncConflicts } from '@maple/firebase/maple-functions/get-sync-conflicts';
export { getSyncConflictSummary } from '@maple/firebase/maple-functions/get-sync-conflict-summary';

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

// Calendar Event functions
export { getCalendarEvents } from '@maple/firebase/maple-functions/get-calendar-events';
export { getCalendarEvent } from '@maple/firebase/maple-functions/get-calendar-event';
export { createCalendarEvent } from '@maple/firebase/maple-functions/create-calendar-event';
export { updateCalendarEvent } from '@maple/firebase/maple-functions/update-calendar-event';
export { deleteCalendarEvent } from '@maple/firebase/maple-functions/delete-calendar-event';

// Calendar ICS feeds are in the maple-calendar codebase

// Calendar triggers (Firestore)
export { onClassWrite } from '@maple/firebase/maple-functions/on-class-write';

// Calendar embed config
export { getCalendarEmbedConfig } from '@maple/firebase/maple-functions/get-calendar-embed-config';
export { updateCalendarEmbedConfig } from '@maple/firebase/maple-functions/update-calendar-embed-config';
export { addCalendarEmbedSource } from '@maple/firebase/maple-functions/add-calendar-embed-source';
export { removeCalendarEmbedSource } from '@maple/firebase/maple-functions/remove-calendar-embed-source';
export { calendarEmbed } from '@maple/firebase/maple-functions/calendar-embed';

// Registration functions (read/update only — create/cancel are in maple-square codebase)
export { getRegistrations } from '@maple/firebase/maple-functions/get-registrations';
export { getRegistration } from '@maple/firebase/maple-functions/get-registration';
export { updateRegistration } from '@maple/firebase/maple-functions/update-registration';
export { calculateRegistrationCost } from '@maple/firebase/maple-functions/calculate-registration-cost';

// Etsy template functions (read/write Firestore only — no Etsy API dep)
export { getEtsyTemplates } from '@maple/firebase/maple-functions/get-etsy-templates';
export { saveEtsyCategoryTemplate } from '@maple/firebase/maple-functions/save-etsy-category-template';
export { saveEtsyArtistTemplate } from '@maple/firebase/maple-functions/save-etsy-artist-template';
