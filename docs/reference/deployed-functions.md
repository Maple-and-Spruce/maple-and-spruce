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
- `syncInvoiceToSquare` _(Firestore trigger on `invoices/{id}` — sends via Square Invoices API on draft → sent, cancels on sent → void)_
- `squareWebhook` now additionally handles `invoice.payment_made` → flips matching invoice to `paid` with `paymentRecord.source = 'square-webhook'`

### Teacher Payouts
- `getTeacherPayouts` — aggregates what Katie owes each teacher over a date range from paid private-pay invoice lines + rendered Hope Scholarship lessons

### Classes
- `getClasses`, `getClass`, `createClass`, `updateClass`, `deleteClass`, `uploadClassImage`, `uploadClassGalleryImage`
- `getPublicClass` _(minInstances: 1 in prod / 0 in dev, concurrency: 80)_
- `getRelatedPublicClasses` _(public; same-category siblings with future sessions + spots remaining; powers the sold-out widget's "other dates" list)_
- `addToClassWaitlist` _(public; idempotent email signup stored under `classes/{id}/waitlist/{emailKey}`)_
- `notifyWaitlistOnSpotOpen` _(Firestore trigger on `registrations/{id}`; on active → inactive transition or delete, queues `class-spot-available` mail to every waitlist email then clears the subcollection)_
- `classCatalogFeed` _(public RSS 2.0 feed at `/catalog/classes.xml`; consumed by Meta Commerce Manager + Google Merchant Center; 15-min cache)_

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
- `onMusicTogetherSectionWrite` — Firestore trigger: auto-generates a public `musictogether` CalendarEvent per session of a live (`open`/`closed`) MT section; reconciles on edit and removes on draft/completed/delete

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

### User & role administration
- `listUsers` _(admin only — Firebase Auth users joined with admin records; powers `/users` page; capped at 1000 per call)_
- `grantAdminRole` _(admin only — promotes another user to admin)_
- `revokeAdminRole` _(admin only — demotes another admin; self-protection: cannot revoke your own admin)_

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
- `squareWebhook` — HTTP endpoint _(memory: 512MiB, concurrency: 10)_. For `catalog.version.updated` events, the handler just bumps the singleton `catalogSyncRequests/pending` doc and acks 200 within Square's 10-second delivery timeout; the actual catalog re-sync runs in `processCatalogSyncRequest`. Inventory and invoice events run inline (fast).
- `processCatalogSyncRequest` — Firestore trigger on `catalogSyncRequests/pending` _(memory: 512MiB, timeout: 540s)_. Lease-based: a burst of N catalog webhooks collapses to a single downstream sync. Reads all Firestore products + all Square catalog items, parallelizes image-URL fetches (concurrency 8), and reconciles.

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
- `adminPauseCraftClubSubscription` / `adminResumeCraftClubSubscription` / `adminCancelCraftClubSubscription` _(admin-only)_ — Square pause/resume/cancel + mirror member status (cancel also emails)
- `createCraftClubSubscription` also emails a welcome on success.

`squareWebhook` additionally handles `subscription.created` / `subscription.updated` — reconciles the member's status (ACTIVE/PAUSED/CANCELED/DEACTIVATED) and paid-through date from Square; idempotent on no-change.

---

## Codebase: `maple-sync` (`apps/functions-sync/`)

Webflow CMS synchronization. Isolates `webflow-api`.

- `syncArtistToWebflow` — Firestore trigger: syncs artist data to Webflow CMS
- `syncClassToWebflow` — Firestore trigger: syncs class data to Webflow CMS
- `syncMusicTogetherSectionToWebflow` — Firestore trigger: syncs Music Together section data to Webflow CMS (non-draft sections; enriches spots-remaining from live family count)
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
