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
- `getClasses`, `getClass`, `createClass`, `updateClass`, `deleteClass`, `uploadClassImage`
- `getPublicClasses` _(minInstances: 1, concurrency: 80)_
- `getPublicClass` _(minInstances: 1, concurrency: 80)_

### Class Categories
- `getClassCategories`

### Discounts
- `getDiscounts`, `createDiscount`, `updateDiscount`, `deleteDiscount`, `lookupDiscount`

### Registrations (read/update)
- `getRegistrations`, `getRegistration`, `updateRegistration`, `calculateRegistrationCost`

### Calendar Events
- `getCalendarEvents`, `getCalendarEvent`, `createCalendarEvent`, `updateCalendarEvent`, `deleteCalendarEvent`

### Calendar Triggers
- `onClassWrite` — Firestore trigger: auto-generates CalendarEvents from published classes

### Calendar Embed Config
- `getCalendarEmbedConfig`, `updateCalendarEmbedConfig`, `addCalendarEmbedSource`, `removeCalendarEmbedSource`
- `calendarEmbed` — HTTP: `/calendar/embed`

### Sales (Phase 5)
- `recordSale` — manually record a product sale with automatic commission calculation, inventory movement, and quantity decrement
- `getSales` — retrieve sales with optional filters (artistId, source, date range)

### Auth
- `checkAdminStatus`

### Infrastructure
- `healthCheck`
- `getPublicArtists` _(minInstances: 1, concurrency: 80)_
- `getSyncConflicts`, `getSyncConflictSummary`

---

## Codebase: `maple-calendar` (`apps/functions-calendar/`)

ICS feed generation. Isolates `ical-generator` and `@touch4it/ical-timezones`.

- `calendarClassesFeed` — HTTP: `/calendar/classes.ics` _(minInstances: 1, concurrency: 80)_
- `calendarMusicFeed` — HTTP: `/calendar/music.ics` _(concurrency: 80)_
- `calendarEventsFeed` — HTTP: `/calendar/events.ics` _(concurrency: 80)_
- `calendarHoursFeed` — HTTP: `/calendar/hours.ics` _(concurrency: 80)_
- `calendarAllFeed` — HTTP: `/calendar/all.ics` _(concurrency: 80)_
- `calendarAdhocProxy` — HTTP: `/calendar/adhoc.ics` _(concurrency: 80)_

---

## Codebase: `maple-square` (`apps/functions-square/`)

Square SDK integration for payments, catalog management, and sync conflict resolution.

### Product writes (Square catalog sync)
- `createProduct`, `updateProduct`, `uploadProductImage`

### Square webhook
- `squareWebhook` — HTTP endpoint _(memory: 512MiB, concurrency: 10)_

### Registration operations (Square payments)
- `createRegistration`, `cancelRegistration`

### Sync conflict resolution
- `detectSyncConflicts` _(memory: 512MiB, concurrency: 10)_
- `resolveSyncConflict`

---

## Codebase: `maple-sync` (`apps/functions-sync/`)

Webflow CMS synchronization. Isolates `webflow-api`.

- `syncArtistToWebflow` — Firestore trigger: syncs artist data to Webflow CMS
- `syncClassToWebflow` — Firestore trigger: syncs class data to Webflow CMS
- `syncRegistrationCount` — Firestore trigger: re-syncs class to Webflow when registrations change (spots remaining)

### Etsy OAuth
- `etsyAuthUrl` — generates OAuth authorization URL for Etsy
- `etsyAuthCallback` — exchanges authorization code for tokens
- `getEtsyConnectionStatus` — checks if Etsy OAuth tokens are valid
- `refreshEtsyShopId` — re-resolves the Etsy shop ID from the API

### Etsy Push (catalog to Etsy)
- `pushProductToEtsy` — creates a draft Etsy listing from a Firestore Product, uploads image, sets variant inventory
- `updateEtsyListing` — syncs current product data to an existing Etsy listing (title, description, prices, quantities)
