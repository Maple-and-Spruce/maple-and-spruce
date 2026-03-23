# Deployed Functions

> All Cloud Functions deploy to `us-east4` (Northern Virginia). Codebase prefix: `maple-functions`.

## Artists
- `getArtists`, `getArtist`, `createArtist`, `updateArtist`, `deleteArtist`, `uploadArtistImage`

## Products
- `getProducts`, `getProduct`, `createProduct`, `updateProduct`, `deleteProduct`, `uploadProductImage`

## Categories
- `getCategories`, `createCategory`, `updateCategory`, `deleteCategory`, `reorderCategories`

## Instructors (Phase 3)
- `getInstructors`, `getInstructor`, `createInstructor`, `updateInstructor`, `deleteInstructor`

## Classes (Phase 3)
- `getClasses`, `getClass`, `createClass`, `updateClass`, `deleteClass`, `uploadClassImage`, `getPublicClasses`, `getPublicClass`

## Class Categories (Phase 3)
- `getClassCategories`

## Discounts (Phase 3c)
- `getDiscounts`, `createDiscount`, `updateDiscount`, `deleteDiscount`, `lookupDiscount`

## Registrations (Phase 3c)
- `getRegistrations`, `getRegistration`, `updateRegistration`, `calculateRegistrationCost`, `createRegistration`, `cancelRegistration`

## Calendar Events (Phase 4.5)
- `getCalendarEvents`, `getCalendarEvent`, `createCalendarEvent`, `updateCalendarEvent`, `deleteCalendarEvent`

## Calendar ICS Feeds (Phase 4.5)
- `calendarClassesFeed` — HTTP: `/calendar/classes.ics`
- `calendarMusicFeed` — HTTP: `/calendar/music.ics`
- `calendarEventsFeed` — HTTP: `/calendar/events.ics` (includes jams)
- `calendarHoursFeed` — HTTP: `/calendar/hours.ics`
- `calendarAllFeed` — HTTP: `/calendar/all.ics`
- `calendarAdhocProxy` — HTTP: `/calendar/adhoc.ics` (proxies Katie's Google Calendar)

## Calendar Triggers (Phase 4.5)
- `onClassWrite` — Firestore trigger: auto-generates CalendarEvents from published classes

## Calendar Embed Config
- `getCalendarEmbedConfig`, `updateCalendarEmbedConfig`, `addCalendarEmbedSource`, `removeCalendarEmbedSource`
- `calendarEmbed` — HTTP: `/calendar/embed` (redirects to OWC with configured sources)

## Auth
- `checkAdminStatus` — Authenticated users can check if they have admin access

## Infrastructure
- `healthCheck`, `squareWebhook`, `getPublicArtists`, `syncArtistToWebflow`
- `detectSyncConflicts`, `getSyncConflicts`, `getSyncConflictSummary`, `resolveSyncConflict`
