# Deployed Functions

> All Cloud Functions deploy to `us-east4` (Northern Virginia).
> Functions are split into 4 codebases to reduce cold start times.

## Codebase: `maple-core` (`apps/functions/`)

Core CRUD operations, auth, triggers, and admin functions. No heavy third-party dependencies.

### Artists
- `getArtists`, `getArtist`, `createArtist`, `updateArtist`, `deleteArtist`, `uploadArtistImage`

### Products (read/delete)
- `getProducts`, `getProduct`, `deleteProduct`

### Categories
- `getCategories`, `createCategory`, `updateCategory`, `deleteCategory`, `reorderCategories`

### Instructors
- `getInstructors`, `getInstructor`, `createInstructor`, `updateInstructor`, `deleteInstructor`

### Music Lesson Students
- `getStudents`, `getStudent`, `createStudent`, `updateStudent`, `deleteStudent`

### Music Lessons
- `getLessons`, `createLesson`, `createLessonSeries`, `updateLesson`, `deleteLesson`

### Music Lesson Invoices (private-pay)
- `getInvoices`, `createInvoice`, `updateInvoice`, `deleteInvoice`
- `recordInvoicePayment` _(records an off-Square payment against a sent invoice — `admin-manual` (cash/check) or `venmo-manual` (Venmo QR witnessed at a lesson); idempotent, admin-gated; see epic #626)_
- `syncInvoiceToSquare` _(Firestore trigger on `invoices/{id}` — sends via Square Invoices API on draft → sent, cancels on sent → void)_
- `squareWebhook` now additionally handles `invoice.payment_made` → flips matching invoice to `paid` with `paymentRecord.source = 'square-webhook'`

### Teacher Payouts
- `getTeacherPayouts` — aggregates what Katie owes each teacher over a date range from paid private-pay invoice lines + rendered Hope Scholarship lessons

### Classes
- `getClasses`, `getClass`, `createClass`, `updateClass`, `deleteClass`, `uploadClassImage`, `uploadClassGalleryImage`
- `getPublicClass` _(minInstances: 1 in prod / 0 in dev, concurrency: 80)_
- `getRelatedPublicClasses` _(public; same-category siblings with future sessions + spots remaining; powers the sold-out widget's "other dates" list)_
- `addToClassWaitlist` _(public; idempotent email signup stored under `classes/{id}/waitlist/{emailKey}`)_
- `getClassWaitlist` _(admin; returns a class's waitlist entries ordered earliest-signup-first plus a count; powers the portal roster's Waitlist section)_
- `getClassWaitlistCounts` _(admin; `classId -> count` map for every class via a `waitlist` collection-group scan, filtered to `classes` parents; powers the classes-list Waitlist column)_
- `notifyWaitlistOnSpotOpen` _(Firestore trigger on `registrations/{id}`; on active → inactive transition or delete, queues `class-spot-available` mail to every waitlist email then clears the subcollection)_
- `classCatalogFeed` _(public RSS 2.0 feed at `/catalog/classes.xml`; consumed by Meta Commerce Manager + Google Merchant Center; 15-min cache)_

### Music Together — cross-section interest list (#602)
- `getPublicMusicTogetherSections` _(public; customer-safe list of visible section options — id, name, first-session, location, derived status — drives the interest form's checkboxes)_
- `addMusicTogetherInterest` _(public; idempotent-per-email upsert to `musicTogetherInterest/{emailKey}` capturing `interestedSectionIds[]` + preference/alternate-time/notes; validates + verifies referenced sections before writing. Broader than the per-section `addToMusicTogetherWaitlist` — works even when nothing is full)_
- `getMusicTogetherInterest` _(admin; returns all interest entries, a per-section demand tally (highest first), and a section-id→name map; powers the MT admin "Interest list" dialog)_

### Class Categories
- `getClassCategories`, `uploadCategoryGalleryImage`

### Discounts
- `getDiscounts`, `createDiscount`, `updateDiscount`, `deleteDiscount`, `lookupDiscount`

### Registrations (read/update)
- `getRegistrations`, `getRegistration`, `updateRegistration`, `calculateRegistrationCost`
- `sendClassReminders` _(scheduled — daily at 8:00 AM ET; queues a day-of reminder email per paid registration whose class has a session today; idempotent via `reminderSentForSessions[sessionIso]`)_

### Calendar Events
- `getCalendarEvents`, `getCalendarEvent`, `createCalendarEvent`, `updateCalendarEvent`, `deleteCalendarEvent`

### Calendar Triggers
- `onClassWrite` — Firestore trigger: auto-generates CalendarEvents from published classes
- `onLessonWrite` — Firestore trigger: auto-generates a private (`public: false`) Spruce Room CalendarEvent per scheduled lesson; removes it on cancel/delete
- `onMusicTogetherSectionWrite` — Firestore trigger: auto-generates a public `musictogether` CalendarEvent per session of a `visible` MT section; reconciles on edit and removes when the section is hidden or deleted

### Room Availability (#467)
- `getRoomSchedule` — admin-only: busy windows for a room over a time range (powers the dashboard "Spruce Room" widget and booking conflict checks)

### Calendar Embed Config
- `getCalendarEmbedConfig`, `updateCalendarEmbedConfig`, `addCalendarEmbedSource`, `removeCalendarEmbedSource`
- `calendarEmbed` — HTTP: `/calendar/embed`

### Sales (Phase 5)
- `recordSale` — manually record a product sale with automatic commission calculation, inventory movement, and quantity decrement
- `getSales` — retrieve sales with optional filters (artistId, source, date range)

### Artist Payouts (Phase 5, #313)
- `generatePayout` — aggregates unpaid sales for an artist over a date range, creates a Payout record, marks each sale with the payoutId
- `markPayoutPaid` — marks a pending payout as paid with payment method and optional reference
- `getPayouts` — retrieves artist payouts with optional filters (artistId, status)

### Agreements & Waivers
- `getAgreementTemplates`, `getAgreementTemplate`, `createAgreementTemplate`, `updateAgreementTemplate`, `deleteAgreementTemplate`
- `getAgreementRequests`, `sendAgreementRequest`, `resendAgreementRequest`
- `getSignedAgreements`, `getSignedAgreement`
- `getAgreementForSigning` _(public, token-based)_
- `submitSignedAgreement` _(public, token-based, 120s timeout)_
- `getRequiredAgreementsForClass` _(public — returns required-at-checkout templates for a class)_
- `expireAgreementRequests` _(scheduled — marks expired requests)_

### Auth
- `checkAdminStatus` _(returns `{ isAdmin, isEmployee, role }` — `role` is the highest-privilege role)_
- `getMyRoles` _(auth only — returns every role the caller holds: admin from `admins/{uid}` + scoped roles from `userRoles/{uid}`; client nav gating)_

> **Roles (epic #617, ADR-028):** "admin only" annotations below predate the scoped-roles matrix. Since PR 3, callables are gated by role sets: Music Together mgmt → admin + `mt-teacher`; store inventory/sales/categories + class registrations/rosters/waitlists/refunds + class reads → admin + `clerk`; lesson/student/invoice/instructor **reads** → admin + `lesson-teacher`; calendar events + room schedule → all staff roles. Everything else remains admin-only. The authoritative table is `apps/functions-integration-tests-utility/src/role-matrix.spec.ts`.

### User & role administration
- `listUsers` _(admin only — Firebase Auth users joined with admin records + scoped roles from `userRoles/{uid}`; powers `/users` page; capped at 1000 per call)_
- `grantAdminRole` _(admin only — promotes another user to admin)_
- `revokeAdminRole` _(admin only — demotes another admin; self-protection: cannot revoke your own admin)_
- `grantRole` _(admin only — grants a scoped role: `mt-teacher`, `clerk`, `lesson-teacher`; writes `userRoles/{uid}.roles`; rejects `admin`)_
- `revokeRole` _(admin only — revokes a scoped role; rejects `admin`)_

### Infrastructure
- `healthCheck`
- `getSyncConflicts`, `getSyncConflictSummary`

### Lead attribution (Tally → GA4 + Meta CAPI)
- `tallyLeadWebhook` — HTTP endpoint (Tally newsletter-signup webhook). Verifies `tally-signature` HMAC, extracts hidden fields, fans out to GA4 Measurement Protocol (`generate_lead`) and Meta Conversions API (`Lead`). _(concurrency: 80, memory: 256MiB.)_ Manual setup: `docs/guides/tally-lead-webhook-setup.md`.

### Craft Club (recurring studio-access membership)
- `getCraftClubMembers` _(admin)_ — lists members, optional status filter
- `approveCraftClubMember` _(admin)_ — pre-approves an email (upsert by email; promotes a `requested` record to `approved`)
- `updateCraftClubMember` _(admin)_ — edits a member's notes/contact/status (e.g. revoke approval)
- `checkCraftClubEligibility` _(public)_ — signup-gate lookup: `approved` / `active` / `requested` / `unknown`
- `requestCraftClubAccess` _(public)_ — captures a non-approved email as a pending request (idempotent by email)
- `requestCraftClubManageLink` _(public)_ — emails a single-use magic link to manage a membership; uniform response (no enumeration)
- `startCraftClubSession` _(public)_ — exchanges a magic-link token (single-use) for a short-lived session token
- `getCraftClubSubscription` _(public, session-gated)_ — returns the member's customer-safe subscription view
- `requestMusicTogetherManageLink` _(public)_ — emails a single-use magic link to update the card on file for an installment registration; uniform response (no enumeration)
- `startMusicTogetherManageSession` _(public)_ — exchanges an MT magic-link token (single-use) for a short-lived session token + a customer-safe manage view (section + next installment)
- _Subscribe + self-service Square mutations live in the `maple-square` codebase; subscription webhooks land in a later phase._

---

## Codebase: `maple-calendar` (`apps/functions-calendar/`)

ICS feed generation. Isolates `ical-generator` and `@touch4it/ical-timezones`.

- `calendarClassesFeed` — HTTP: `/calendar/classes.ics` _(concurrency: 80; CDN-cached 5min)_
- `calendarMusicFeed` — HTTP: `/calendar/music.ics` _(concurrency: 80)_
- `calendarEventsFeed` — HTTP: `/calendar/events.ics` _(concurrency: 80)_
- `calendarHoursFeed` — HTTP: `/calendar/hours.ics` _(concurrency: 80)_
- `calendarAllFeed` — HTTP: `/calendar/all.ics` _(concurrency: 80)_
- `calendarAdhocProxy` — HTTP: `/calendar/adhoc.ics` _(concurrency: 80)_
- `calendarMusicTogetherFeed` — HTTP: `/calendar/musictogether.ics` — public Music Together events feed _(concurrency: 80; CDN-cached 5min)_

---

## Codebase: `maple-square` (`apps/functions-square/`)

Square SDK integration for payments, catalog management, and sync conflict resolution.

### Product writes (Square catalog sync)
- `createProduct`, `updateProduct`, `uploadProductImage`

### Square webhook
- `squareWebhook` — HTTP endpoint _(memory: 512MiB, concurrency: 10)_. For `catalog.version.updated` events, the handler just bumps the singleton `catalogSyncRequests/pending` doc and acks 200 within Square's 10-second delivery timeout; the actual catalog re-sync runs in `processCatalogSyncRequest`. For `payment.created` / `payment.updated` events with a `COMPLETED` payment, it enqueues a `posSaleRequests/{paymentId}` doc (stays lean — no Square SDK) and returns; `processPosSale` does the work. Inventory and invoice events run inline (fast).
- `processCatalogSyncRequest` — Firestore trigger on `catalogSyncRequests/pending` _(memory: 512MiB, timeout: 540s)_. Lease-based: a burst of N catalog webhooks collapses to a single downstream sync. Reads all Firestore products + all Square catalog items, parallelizes image-URL fetches (concurrency 8), and reconciles.
- `processPosSale` — Firestore trigger on `posSaleRequests/{paymentId}` _(memory: 512MiB)_. Turns a completed in-person Square POS class sale into a `source:'pos'` registration. Fetches the payment/order/customer from Square, skips web-originated orders (`referenceId` dedup) and already-processed orders (`squareOrderId` idempotency), creates a registration per class line item, and emails the admin via the `mail` collection when the sale has no customer email. Requires `payment.created` + `payment.updated` enabled on the Square webhook subscription (both sandbox and prod) — see `docs/guides/pos-class-registration.md`.

### Registration operations (Square payments)
- `createRegistration`, `cancelRegistration`

### Sync conflict resolution
- `detectSyncConflicts` _(memory: 512MiB, concurrency: 10)_ — detects mismatches between Firestore and Square/Etsy; accepts optional `system` filter (`square` | `etsy`)
- `resolveSyncConflict` — resolves detected conflicts by pushing/pulling data to/from Square or Etsy

### Cross-Channel Inventory Sync
- `syncInventoryToSquare` — pushes current Firestore product quantities to Square via physical count adjustments

### Craft Club subscription (Square)
- `createCraftClubSubscription` _(public)_ — re-checks the approval gate server-side, then upserts the Square customer, stores the card on file from the Web Payments nonce, enrolls it in the $30/mo subscription plan, and mirrors the result onto the member record
- `cancelCraftClubSubscription` _(public, session-gated)_ — cancels the Square subscription at period end, marks the member cancelled, and emails a confirmation
- `updateCraftClubPaymentMethod` _(public, session-gated)_ — files a new card from a Web Payments nonce and points the subscription at it
- `updateMusicTogetherPaymentMethod` _(public, session-gated, MT Square account)_ — vaults a new card on file for an installment registration, repoints `registration.squareCardId` at it (retargets pending Week-5 scheduled charges), and disables the old card
- `adminPauseCraftClubSubscription` / `adminResumeCraftClubSubscription` / `adminCancelCraftClubSubscription` _(admin-only)_ — Square pause/resume/cancel + mirror member status (cancel also emails)
- `createCraftClubSubscription` also emails a welcome on success.

`squareWebhook` additionally handles `subscription.created` / `subscription.updated` — reconciles the member's status (ACTIVE/PAUSED/CANCELED/DEACTIVATED) and paid-through date from Square; idempotent on no-change.

---

## Codebase: `maple-sync` (`apps/functions-sync/`)

Webflow CMS synchronization. Isolates `webflow-api`.

- `syncArtistToWebflow` — Firestore trigger: syncs artist data to Webflow CMS
- `syncClassToWebflow` — Firestore trigger: syncs class data to Webflow CMS
- `syncMusicTogetherSectionToWebflow` — Firestore trigger: syncs Music Together section data to Webflow CMS (`visible` sections; enriches spots-remaining from live family count; sends the derived section status)
- `syncMusicTogetherSemesterToWebflow` — Firestore trigger: syncs Music Together semester (term) data to Webflow CMS (all statuses incl. `planned`; only removed on delete)
- `syncRegistrationCount` — Firestore trigger: re-syncs class to Webflow when registrations change (spots remaining)

### Etsy OAuth
- `etsyAuthUrl` — generates OAuth authorization URL for Etsy
- `etsyAuthCallback` — exchanges authorization code for tokens
- `getEtsyConnectionStatus` — checks if Etsy OAuth tokens are valid
- `refreshEtsyShopId` — re-resolves the Etsy shop ID from the API

### Etsy Push (catalog to Etsy)
- `pushProductToEtsy` — creates a draft Etsy listing from a Firestore Product, uploads image, sets variant inventory
- `updateEtsyListing` — syncs current product data to an existing Etsy listing (title, description, prices, quantities)

### Etsy Order Polling
- `pollEtsyOrders` — polls Etsy Receipts API for new sales, creates Sale records + InventoryMovements, decrements variant quantities

### Cross-Channel Inventory Sync
- `syncInventoryToEtsy` — pushes current Firestore product quantities to the linked Etsy listing
