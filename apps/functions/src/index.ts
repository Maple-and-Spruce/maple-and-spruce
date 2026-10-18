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
// MUST be first: sets global maxInstances before any function is defined.
// See global-runtime-options.ts for the ordering contract.
import '@maple/firebase/functions/global-runtime-options';
import { getApps, initializeApp } from 'firebase-admin/app';

// Initialize Firebase Admin at the entry point, before any function handlers run.
// This ensures the admin SDK is ready for Firestore triggers (onDocumentWritten)
// which can execute before lazy initialization in individual modules takes effect.
if (getApps().length === 0) {
  initializeApp();
}

// Health check for testing
export { healthCheck } from '@maple/firebase/maple-functions/health-check';

// Auth functions

// Artist functions
// One domain router serving getArtists / getArtist / createArtist /
// updateArtist / deleteArtist (ADR-029). The five single-purpose functions it
// replaced were deleted once it was verified in dev.
export { artists } from '@maple/firebase/maple-functions/artists';
// Payouts domain router: class-instructor statements (ADR-029).
export { payouts } from '@maple/firebase/maple-functions/payouts';
export { hope } from '@maple/firebase/maple-functions/hope';
export { settings } from '@maple/firebase/maple-functions/settings';
export { discounts } from '@maple/firebase/maple-functions/discounts';
// Agreements domain router: templates, requests, signed agreements (ADR-029, #66).
export { agreements } from '@maple/firebase/maple-functions/agreements';
export { products } from '@maple/firebase/maple-functions/products';
export { uploadArtistImage } from '@maple/firebase/maple-functions/upload-artist-image';

// Category functions

// Product functions (read/delete only — writes are in maple-square codebase)

// Sync conflict functions (read-only — resolution is in maple-square codebase)
export { getSyncConflicts } from '@maple/firebase/maple-functions/get-sync-conflicts';
export { getSyncConflictSummary } from '@maple/firebase/maple-functions/get-sync-conflict-summary';
// POS lesson attribution review queue + config (legacy #628)
// Lessons domain router (ADR-029, #67).
export { lessons } from '@maple/firebase/maple-functions/lessons';

// Instructor functions
export { getInstructors } from '@maple/firebase/maple-functions/get-instructors';
export { getInstructor } from '@maple/firebase/maple-functions/get-instructor';
export { createInstructor } from '@maple/firebase/maple-functions/create-instructor';
export { updateInstructor } from '@maple/firebase/maple-functions/update-instructor';
export { deleteInstructor } from '@maple/firebase/maple-functions/delete-instructor';
export { uploadInstructorImage } from '@maple/firebase/maple-functions/upload-instructor-image';

// Music lesson student functions (Phase 4)
// People domain router: students, users and roles (ADR-029, #65). getMyRoles stays
// its own function: it gates every admin page on first paint.
export { people } from '@maple/firebase/maple-functions/people';

// Music lesson functions (Phase 4)
export { getNeedsAttention } from '@maple/firebase/maple-functions/get-needs-attention';
export { syncLessonInquiries } from '@maple/firebase/maple-functions/sync-lesson-inquiries';
export { triggerLessonInquirySync } from '@maple/firebase/maple-functions/trigger-lesson-inquiry-sync';

// Music lesson invoice functions (Phase 4)
export { getInvoices } from '@maple/firebase/maple-functions/get-invoices';
export { createInvoice } from '@maple/firebase/maple-functions/create-invoice';
export { updateInvoice } from '@maple/firebase/maple-functions/update-invoice';
export { recordInvoicePayment } from '@maple/firebase/maple-functions/record-invoice-payment';
export { deleteInvoice } from '@maple/firebase/maple-functions/delete-invoice';

// Teacher payout aggregation (Phase 4, legacy #283)

// Class functions
export { getClasses } from '@maple/firebase/maple-functions/get-classes';
export { getClass } from '@maple/firebase/maple-functions/get-class';
export { createClass } from '@maple/firebase/maple-functions/create-class';
export { updateClass } from '@maple/firebase/maple-functions/update-class';
export { deleteClass } from '@maple/firebase/maple-functions/delete-class';
export { duplicateClass } from '@maple/firebase/maple-functions/duplicate-class';
export { uploadClassImage } from '@maple/firebase/maple-functions/upload-class-image';
export { uploadClassGalleryImage } from '@maple/firebase/maple-functions/upload-class-gallery-image';
export { migrateClassSessions } from '@maple/firebase/maple-functions/migrate-class-sessions';

// Public reads for the Webflow widgets, on one warm router (ADR-029). The
// public writes below stay with their domains.
export { publicSite } from '@maple/firebase/maple-functions/public-site';

// Public class API (no auth required - for Webflow integration)
export { addToMusicTogetherWaitlist } from '@maple/firebase/maple-functions/add-to-music-together-waitlist';
export { addMusicTogetherDemoRsvp } from '@maple/firebase/maple-functions/add-music-together-demo-rsvp';
export { getMusicTogetherDemoRsvps } from '@maple/firebase/maple-functions/get-music-together-demo-rsvps';
export { addMusicTogetherInterest } from '@maple/firebase/maple-functions/add-music-together-interest';
export { getMusicTogetherInterest } from '@maple/firebase/maple-functions/get-music-together-interest';

// Music Together admin section management
export { getMusicTogetherSemesters } from '@maple/firebase/maple-functions/get-music-together-semesters';
export { createMusicTogetherSemester } from '@maple/firebase/maple-functions/create-music-together-semester';
export { updateMusicTogetherSemester } from '@maple/firebase/maple-functions/update-music-together-semester';
export { getMusicTogetherSections } from '@maple/firebase/maple-functions/get-music-together-sections';
export { createMusicTogetherSection } from '@maple/firebase/maple-functions/create-music-together-section';
export { updateMusicTogetherSection } from '@maple/firebase/maple-functions/update-music-together-section';
export { duplicateMusicTogetherSection } from '@maple/firebase/maple-functions/duplicate-music-together-section';
export { getMusicTogetherRoster } from '@maple/firebase/maple-functions/get-music-together-roster';
export { waiveMusicTogetherInstallment } from '@maple/firebase/maple-functions/waive-music-together-installment';

// Music Together admin demo-class management
export { getMusicTogetherDemos } from '@maple/firebase/maple-functions/get-music-together-demos';
export { createMusicTogetherDemo } from '@maple/firebase/maple-functions/create-music-together-demo';
export { updateMusicTogetherDemo } from '@maple/firebase/maple-functions/update-music-together-demo';
export { deleteMusicTogetherDemo } from '@maple/firebase/maple-functions/delete-music-together-demo';
export { addToClassWaitlist } from '@maple/firebase/maple-functions/add-to-class-waitlist';
export { getClassWaitlist } from '@maple/firebase/maple-functions/get-class-waitlist';
export { getClassWaitlistCounts } from '@maple/firebase/maple-functions/get-class-waitlist-counts';
export { notifyWaitlistOnSpotOpen } from '@maple/firebase/maple-functions/notify-waitlist-on-spot-open';

// Public class catalog feed (RSS 2.0 for Meta Commerce Manager + Google Merchant Center)
export { classCatalogFeed } from '@maple/firebase/maple-functions/class-catalog-feed';

// Class category functions
export { getClassCategories } from '@maple/firebase/maple-functions/get-class-categories';
export { createClassCategory } from '@maple/firebase/maple-functions/create-class-category';
export { updateClassCategory } from '@maple/firebase/maple-functions/update-class-category';
export { deleteClassCategory } from '@maple/firebase/maple-functions/delete-class-category';
export { reorderClassCategories } from '@maple/firebase/maple-functions/reorder-class-categories';
export { uploadCategoryGalleryImage } from '@maple/firebase/maple-functions/upload-category-gallery-image';

// Calendar Event functions
// Calendar domain router: events, room schedule, embed config (ADR-029, #73).
export { calendar } from '@maple/firebase/maple-functions/calendar';

// Calendar ICS feeds are in the maple-calendar codebase

// Calendar triggers (Firestore)
export { onClassWrite } from '@maple/firebase/maple-functions/on-class-write';
export { onLessonWrite } from '@maple/firebase/maple-functions/on-lesson-write';
// Teacher My Day + business payment config (legacy #631)
export { onMusicTogetherSectionWrite } from '@maple/firebase/maple-functions/on-music-together-section-write';
export { onMusicTogetherDemoWrite } from '@maple/firebase/maple-functions/on-music-together-demo-write';

// Room availability

// Calendar embed config
export { calendarEmbed } from '@maple/firebase/maple-functions/calendar-embed';

// Registration functions (read/update only — create/cancel are in maple-square codebase)
export { getRegistrations } from '@maple/firebase/maple-functions/get-registrations';
export { getRegistration } from '@maple/firebase/maple-functions/get-registration';
export { updateRegistration } from '@maple/firebase/maple-functions/update-registration';

// Agreements kept off the `agreements` router: the public signing page and the
// expiry schedule. The widget's required-agreements lookup is on `publicSite`.
export { getAgreementForSigning } from '@maple/firebase/maple-functions/get-agreement-for-signing';
export { submitSignedAgreement } from '@maple/firebase/maple-functions/submit-signed-agreement';

// Agreement scheduled functions
export { expireAgreementRequests } from '@maple/firebase/maple-functions/expire-agreement-requests';
export { releaseStaleRegistrationHolds } from '@maple/firebase/maple-functions/release-stale-registration-holds';

// Registration scheduled functions
export { sendClassReminders } from '@maple/firebase/maple-functions/send-class-reminders';
export { triggerClassReminders } from '@maple/firebase/maple-functions/trigger-class-reminders';

// Music Together scheduled functions
export { sendMusicTogetherReminders } from '@maple/firebase/maple-functions/send-music-together-reminders';
export { triggerMusicTogetherReminders } from '@maple/firebase/maple-functions/trigger-music-together-reminders';

// Etsy template functions (read/write Firestore only — no Etsy API dep)
export { getEtsyTemplates } from '@maple/firebase/maple-functions/get-etsy-templates';
export { saveEtsyCategoryTemplate } from '@maple/firebase/maple-functions/save-etsy-category-template';
export { saveEtsyArtistTemplate } from '@maple/firebase/maple-functions/save-etsy-artist-template';

// Etsy listing read (for import review UI — calls Etsy API, no Square dep)
export { listEtsyListings } from '@maple/firebase/maple-functions/list-etsy-listings';

// Phase 5: Sales tracking
export { recordSale } from '@maple/firebase/maple-functions/record-sale';
export { getSales } from '@maple/firebase/maple-functions/get-sales';

// User & role administration (admin /users page)
export { getMyRoles } from '@maple/firebase/maple-functions/get-my-roles';

// Lead attribution: tallyLeadWebhook now lives in the maple-webhooks codebase
// (apps/functions-webhooks). Tally hangs up at 10s and this bundle takes ~14s
// to cold start, so every signup landing on a cold instance was dropped.
// Do not move it back.
// Meta Conversions API Purchase on confirmed class registrations — recovers
// iOS/ITP-dropped and hosted-checkout conversions the browser Pixel misses.
export { sendRegistrationConversion } from '@maple/firebase/maple-functions/send-registration-conversion';
export { sendMusicTogetherConversion } from '@maple/firebase/maple-functions/send-music-together-conversion';

// Craft Club — admin approval & management (no Square dep; subscribe/lifecycle
// functions live in the maple-square codebase)
export { getCraftClubMembers } from '@maple/firebase/maple-functions/get-craft-club-members';
export { approveCraftClubMember } from '@maple/firebase/maple-functions/approve-craft-club-member';
export { updateCraftClubMember } from '@maple/firebase/maple-functions/update-craft-club-member';
// Craft Club — public signup-gate endpoints (no Square dep)
export { checkCraftClubEligibility } from '@maple/firebase/maple-functions/check-craft-club-eligibility';
export { requestCraftClubAccess } from '@maple/firebase/maple-functions/request-craft-club-access';
// Craft Club — self-service magic-link + session endpoints (no Square dep)
export { requestCraftClubManageLink } from '@maple/firebase/maple-functions/request-craft-club-manage-link';
export { startCraftClubSession } from '@maple/firebase/maple-functions/start-craft-club-session';
export { getCraftClubSubscription } from '@maple/firebase/maple-functions/get-craft-club-subscription';

// Music Together — self-service card-on-file management magic-link + session
// (no Square dep; the card update itself lives in the maple-square codebase).
export { requestMusicTogetherManageLink } from '@maple/firebase/maple-functions/request-music-together-manage-link';
export { startMusicTogetherManageSession } from '@maple/firebase/maple-functions/start-music-together-manage-session';

// Lesson billing rules (#81) — the reusable "every 4 lessons, charged the day
// before" rules Katie and Nathan attach to students, plus a read of what is
// going to be charged. Plain Firestore; the job that moves money needs the
// Square SDK and lives in the maple-square codebase.
