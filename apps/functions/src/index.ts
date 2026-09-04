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
import { createPublicFunction } from '@maple/firebase/functions';

// Initialize Firebase Admin at the entry point, before any function handlers run.
// This ensures the admin SDK is ready for Firestore triggers (onDocumentWritten)
// which can execute before lazy initialization in individual modules takes effect.
if (getApps().length === 0) {
  initializeApp();
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
// POS lesson attribution review queue + config (#628)
export { getPosLessonAttributions } from '@maple/firebase/maple-functions/get-pos-lesson-attributions';
export { getPosLessonAttributionSummary } from '@maple/firebase/maple-functions/get-pos-lesson-attribution-summary';
export { resolvePosLessonAttribution } from '@maple/firebase/maple-functions/resolve-pos-lesson-attribution';
export { getPosLessonConfig } from '@maple/firebase/maple-functions/get-pos-lesson-config';
export { updatePosLessonConfig } from '@maple/firebase/maple-functions/update-pos-lesson-config';

// Instructor functions
export { getInstructors } from '@maple/firebase/maple-functions/get-instructors';
export { getInstructor } from '@maple/firebase/maple-functions/get-instructor';
export { createInstructor } from '@maple/firebase/maple-functions/create-instructor';
export { updateInstructor } from '@maple/firebase/maple-functions/update-instructor';
export { deleteInstructor } from '@maple/firebase/maple-functions/delete-instructor';
export { uploadInstructorImage } from '@maple/firebase/maple-functions/upload-instructor-image';

// Music lesson student functions (Phase 4)
export { getStudents } from '@maple/firebase/maple-functions/get-students';
export { getStudent } from '@maple/firebase/maple-functions/get-student';
export { createStudent } from '@maple/firebase/maple-functions/create-student';
export { updateStudent } from '@maple/firebase/maple-functions/update-student';
export { deleteStudent } from '@maple/firebase/maple-functions/delete-student';

// Music lesson functions (Phase 4)
export { getLessons } from '@maple/firebase/maple-functions/get-lessons';
export { createLesson } from '@maple/firebase/maple-functions/create-lesson';
export { createLessonSeries } from '@maple/firebase/maple-functions/create-lesson-series';
export { updateLesson } from '@maple/firebase/maple-functions/update-lesson';
export { deleteLesson } from '@maple/firebase/maple-functions/delete-lesson';
export { getLessonBlocks } from '@maple/firebase/maple-functions/get-lesson-blocks';
export { getNeedsAttention } from '@maple/firebase/maple-functions/get-needs-attention';
export { getHopeQueue } from '@maple/firebase/maple-functions/get-hope-queue';
export { recordHopeSubmissions } from '@maple/firebase/maple-functions/record-hope-submissions';
export {
  syncLessonInquiries,
  triggerLessonInquirySync,
} from '@maple/firebase/maple-functions/sync-lesson-inquiries';
export { getLessonInquiries } from '@maple/firebase/maple-functions/get-lesson-inquiries';
export { updateLessonInquiryStatus } from '@maple/firebase/maple-functions/update-lesson-inquiry-status';
export { createLessonBlock } from '@maple/firebase/maple-functions/create-lesson-block';
export { updateLessonBlock } from '@maple/firebase/maple-functions/update-lesson-block';
export { deleteLessonBlock } from '@maple/firebase/maple-functions/delete-lesson-block';

// Music lesson invoice functions (Phase 4)
export { getInvoices } from '@maple/firebase/maple-functions/get-invoices';
export { createInvoice } from '@maple/firebase/maple-functions/create-invoice';
export { updateInvoice } from '@maple/firebase/maple-functions/update-invoice';
export { recordInvoicePayment } from '@maple/firebase/maple-functions/record-invoice-payment';
export { deleteInvoice } from '@maple/firebase/maple-functions/delete-invoice';

// Teacher payout aggregation (Phase 4, #283)
export { getTeacherPayouts } from '@maple/firebase/maple-functions/get-teacher-payouts';

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

// Public class API (no auth required - for Webflow integration)
export { getPublicClass } from '@maple/firebase/maple-functions/get-public-class';
export { getRegistrationStatus } from '@maple/firebase/maple-functions/get-registration-status';
export { getPublicMusicTogetherSection } from '@maple/firebase/maple-functions/get-public-music-together-section';
export { addToMusicTogetherWaitlist } from '@maple/firebase/maple-functions/add-to-music-together-waitlist';
export { addMusicTogetherDemoRsvp } from '@maple/firebase/maple-functions/add-music-together-demo-rsvp';
export { getMusicTogetherDemoRsvps } from '@maple/firebase/maple-functions/get-music-together-demo-rsvps';
export { getPublicMusicTogetherDemos } from '@maple/firebase/maple-functions/get-public-music-together-demos';
export { getPublicMusicTogetherSections } from '@maple/firebase/maple-functions/get-public-music-together-sections';
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
export { onLessonWrite } from '@maple/firebase/maple-functions/on-lesson-write';
export { onLessonRenderedInvoice } from '@maple/firebase/maple-functions/on-lesson-rendered-invoice';
export { getLessonRatesConfig } from '@maple/firebase/maple-functions/get-lesson-rates-config';
// Teacher My Day + business payment config (#631)
export { getMyDayLessons } from '@maple/firebase/maple-functions/get-my-day-lessons';
export { getMyWeek } from '@maple/firebase/maple-functions/get-my-week';
export { getBusinessPaymentConfig } from '@maple/firebase/maple-functions/get-business-payment-config';
export { updateBusinessPaymentConfig } from '@maple/firebase/maple-functions/update-business-payment-config';
export { updateLessonRatesConfig } from '@maple/firebase/maple-functions/update-lesson-rates-config';
export { onMusicTogetherSectionWrite } from '@maple/firebase/maple-functions/on-music-together-section-write';
export { onMusicTogetherDemoWrite } from '@maple/firebase/maple-functions/on-music-together-demo-write';

// Room availability
export { getRoomSchedule } from '@maple/firebase/maple-functions/get-room-schedule';

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

// Agreement template functions
export { getAgreementTemplates } from '@maple/firebase/maple-functions/get-agreement-templates';
export { getAgreementTemplate } from '@maple/firebase/maple-functions/get-agreement-template';
export { createAgreementTemplate } from '@maple/firebase/maple-functions/create-agreement-template';
export { updateAgreementTemplate } from '@maple/firebase/maple-functions/update-agreement-template';
export { deleteAgreementTemplate } from '@maple/firebase/maple-functions/delete-agreement-template';

// Agreement request functions
export { getAgreementRequests } from '@maple/firebase/maple-functions/get-agreement-requests';
export { sendAgreementRequest } from '@maple/firebase/maple-functions/send-agreement-request';
export { resendAgreementRequest } from '@maple/firebase/maple-functions/resend-agreement-request';

// Signed agreement functions
export { getSignedAgreements } from '@maple/firebase/maple-functions/get-signed-agreements';
export { getSignedAgreement } from '@maple/firebase/maple-functions/get-signed-agreement';

// Public signing functions (no auth required)
export { getAgreementForSigning } from '@maple/firebase/maple-functions/get-agreement-for-signing';
export { submitSignedAgreement } from '@maple/firebase/maple-functions/submit-signed-agreement';
export { getRequiredAgreementsForClass } from '@maple/firebase/maple-functions/get-required-agreements-for-class';

// Agreement scheduled functions
export { expireAgreementRequests } from '@maple/firebase/maple-functions/expire-agreement-requests';
export { releaseStaleRegistrationHolds } from '@maple/firebase/maple-functions/release-stale-registration-holds';

// Registration scheduled functions
export {
  sendClassReminders,
  triggerClassReminders,
} from '@maple/firebase/maple-functions/send-class-reminders';

// Music Together scheduled functions
export {
  sendMusicTogetherReminders,
  triggerMusicTogetherReminders,
} from '@maple/firebase/maple-functions/send-music-together-reminders';

// Etsy template functions (read/write Firestore only — no Etsy API dep)
export { getEtsyTemplates } from '@maple/firebase/maple-functions/get-etsy-templates';
export { saveEtsyCategoryTemplate } from '@maple/firebase/maple-functions/save-etsy-category-template';
export { saveEtsyArtistTemplate } from '@maple/firebase/maple-functions/save-etsy-artist-template';

// Etsy listing read (for import review UI — calls Etsy API, no Square dep)
export { listEtsyListings } from '@maple/firebase/maple-functions/list-etsy-listings';

// Phase 5: Sales tracking
export { recordSale } from '@maple/firebase/maple-functions/record-sale';
export { getSales } from '@maple/firebase/maple-functions/get-sales';

// Phase 5: Artist payouts (#313)
export { generatePayout } from '@maple/firebase/maple-functions/generate-payout';
export { markPayoutPaid } from '@maple/firebase/maple-functions/mark-payout-paid';
export { getPayouts } from '@maple/firebase/maple-functions/get-payouts';

// User & role administration (admin /users page)
export { listUsers } from '@maple/firebase/maple-functions/list-users';
export { grantAdminRole } from '@maple/firebase/maple-functions/grant-admin-role';
export { revokeAdminRole } from '@maple/firebase/maple-functions/revoke-admin-role';
export { getMyRoles } from '@maple/firebase/maple-functions/get-my-roles';
export { grantRole } from '@maple/firebase/maple-functions/grant-role';
export { revokeRole } from '@maple/firebase/maple-functions/revoke-role';

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
