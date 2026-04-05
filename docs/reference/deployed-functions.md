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
