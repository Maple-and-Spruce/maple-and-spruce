# Public Calendar System Implementation Plan

> **Phase**: 4.5 (can be built in parallel with or after Phase 4)
> **Status**: Planned
> **Date**: 2026-03-21

---

## Summary

Unified public calendar showing all Maple & Spruce activities. Firestore owns all structured data (classes, music lessons, events). Multiple ICS feeds are published via Cloud Functions. Katie subscribes to feeds in Google Calendar and adds ad-hoc events on a separate published Google Calendar. The public website aggregates everything via FullCalendar. No bidirectional sync anywhere.

### Data Flow

```
SOURCES OF TRUTH                    CONSUMERS

Firestore (classes)  -> /api/calendar/classes.ics --+--> Katie's Google Calendar
Firestore (music)    -> /api/calendar/music.ics  ---+    (subscribes to each, color-coded)
Firestore (events)   -> /api/calendar/events.ics ---+
Firestore (hours)    -> /api/calendar/hours.ics  ---+
                                                    |
Katie's Google Cal   -> (public ICS URL) -----------+--> Public /calendar page
  "M&S Ad Hoc"                                      |    (FullCalendar, color-coded)
                                                    |
                                                    +--> Anyone's personal calendar
                                                         (subscribe by URL)
```

---

## Step 1: Domain Type and Firestore Collection

### 1a. Create `CalendarEvent` domain type

**Location:** `libs/ts/domain/src/lib/calendar-event.ts`

Follow the pattern in `class.ts`. Define:

```typescript
export type CalendarEventType = 'class' | 'lesson' | 'event' | 'jam' | 'hours';

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startDateTime: Date;
  endDateTime: Date;
  /** RFC 5545 RRULE string, e.g. "FREQ=WEEKLY;BYDAY=FR" for Friday Jam. Null for one-time events. */
  recurrenceRule: string | null;
  /** Defaults to "688 Beulah Road, Morgantown, WV 26508" */
  location: string;
  type: CalendarEventType;
  /** Controls inclusion in public ICS feeds. Default true. */
  public: boolean;
  /** Optional reference to originating doc, e.g. "classes/abc123". Null for ad-hoc events. */
  sourceRef: string | null;
  /** Firebase Auth UID of creator */
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
```

Also define `CreateCalendarEventInput`, `UpdateCalendarEventInput`, and any helper functions (following the `class.ts` pattern with `Omit`/`Partial` types).

Export from `libs/ts/domain/src/index.ts`.

### 1b. Create `calendar-event.repository.ts`

**Location:** `libs/firebase/database/src/lib/calendar-event.repository.ts`

Follow the pattern in `class.repository.ts`. Collection name: `calendarEvents`. Include:
- `getCalendarEvents()` -- all events
- `getPublicCalendarEvents()` -- where `public === true`
- `getPublicCalendarEventsByType(type: CalendarEventType)` -- filtered by type and public
- `getCalendarEvent(id: string)`
- `createCalendarEvent(input: CreateCalendarEventInput)`
- `updateCalendarEvent(input: UpdateCalendarEventInput)`
- `deleteCalendarEvent(id: string)`

Export from `libs/firebase/database/src/index.ts`.

### 1c. Firestore security rules

**File:** `firestore.rules`

Add rules for `calendarEvents` collection matching existing patterns:
- Admin (authenticated + admin claim): read/write
- Public: read where `resource.data.public == true`

### 1d. Vest validation suite

**Location:** `libs/ts/validation/src/lib/calendar-event.validation.ts`

Validate: title required (max 200 chars), startDateTime required and must be before endDateTime, type must be valid enum value, recurrenceRule is optional but if provided must be non-empty string.

Write tests in `calendar-event.validation.spec.ts`.

---

## Step 2: Admin CRUD (Cloud Functions + UI)

### 2a. Cloud Functions

Create these following the library-per-function pattern (`libs/firebase/maple-functions/{name}/`):

| Function | Library name | Type |
|----------|-------------|------|
| `createCalendarEvent` | `firebase-maple-functions-create-calendar-event` | callable |
| `updateCalendarEvent` | `firebase-maple-functions-update-calendar-event` | callable |
| `deleteCalendarEvent` | `firebase-maple-functions-delete-calendar-event` | callable |
| `getCalendarEvents` | `firebase-maple-functions-get-calendar-events` | callable |
| `getCalendarEvent` | `firebase-maple-functions-get-calendar-event` | callable |

Use the `create-cloud-function` skill for scaffolding. Export all from `apps/functions/src/index.ts`. Update `docs/reference/deployed-functions.md`.

### 2b. Admin UI

**Location:** `apps/maple-spruce/src/app/events/`

Create an `/events` admin route. Follow the patterns in the existing `/classes` admin pages:
- Data table listing all calendar events (use `RequestState<T>`, not boolean loading flags)
- Add/edit dialog with form fields: title, description, start/end datetime, recurrence (dropdown: one-time, weekly, biweekly, monthly, custom RRULE), location (prefilled "688 Beulah Road, Morgantown, WV 26508"), public toggle, type selector
- Delete with confirmation
- Use Preact Signals for form state (ADR-015)
- Use Vest validation suite from Step 1d
- Use MUI theme tokens for all colors

Add the `/events` route to the admin navigation alongside existing routes.

### 2c. Data hooks

**Location:** `libs/react/data/` (or create `libs/react/events/` if that pattern is used)

Create hooks following the pattern of existing data hooks (check `libs/react/classes/` or `libs/react/data/`):
- `useCalendarEvents()` -- admin, all events
- `useCalendarEvent(id)` -- single event
- CRUD mutation hooks as needed

### 2d. Seed data

Create a seed script or document the manual creation of:
- **Friday Night Old-Time Jam**: weekly, Fridays 7-9 PM, type `jam`, recurrenceRule `FREQ=WEEKLY;BYDAY=FR`
- **Store hours**: Wed/Fri/Sat noon-6pm as recurring `hours` type events (or handle statically in the ICS feed, see Step 3 open question)

---

## Step 3: Auto-generation Triggers (Class -> CalendarEvent)

### 3a. Cloud Function: `onClassWrite`

**Library:** `firebase-maple-functions-on-class-write`
**Type:** Firestore trigger (`onDocumentWritten('classes/{classId}')`)

When a class document is created/updated/deleted:
- **Create**: Generate a corresponding `CalendarEvent` with `type: 'class'`, `sourceRef: 'classes/{classId}'`, title from class name, startDateTime from class dateTime, endDateTime computed from dateTime + durationMinutes, location from class location, `public: true` only if class status is `published`.
- **Update**: Update the corresponding CalendarEvent (find by `sourceRef`). If class status changes away from `published`, set `public: false`.
- **Delete**: Delete the corresponding CalendarEvent.

This ensures the calendar automatically reflects anything created through the existing class admin UI.

### 3b. Stub for lessons

Create a placeholder trigger `onLessonWrite` that logs a message and exits. Activate it when Phase 4 delivers the lessons collection.

---

## Step 4: ICS Feed Endpoints

### 4a. Install dependency

```bash
pnpm add ical-generator
```

### 4b. Create ICS generation library

**Location:** `libs/ts/calendar/` (new shared library)

This library contains the pure logic for converting `CalendarEvent[]` into ICS calendar strings. No Firebase dependencies -- just takes domain types and returns strings. This keeps the Cloud Functions thin.

```typescript
// libs/ts/calendar/src/lib/generate-ics-feed.ts
import ical from 'ical-generator';
import type { CalendarEvent } from '@maple/domain';

export function generateIcsFeed(
  events: CalendarEvent[],
  calendarName: string
): string {
  // Build calendar with timezone 'America/New_York'
  // Map CalendarEvent fields to ical events
  // Handle recurrenceRule -> repeating property
  // Return .toString()
}
```

Write Vitest tests. Use `node-ical` (dev dependency) to parse output and assert correctness.

### 4c. Cloud Functions for ICS feeds

Create four callable HTTP functions (not callable -- these need to be plain HTTP endpoints that return `text/calendar`):

| Function | Library name | Query |
|----------|-------------|-------|
| `/calendar/classes.ics` | `firebase-maple-functions-calendar-classes-feed` | `calendarEvents` where type=class, public=true |
| `/calendar/music.ics` | `firebase-maple-functions-calendar-music-feed` | `calendarEvents` where type=lesson, public=true |
| `/calendar/events.ics` | `firebase-maple-functions-calendar-events-feed` | `calendarEvents` where type in [event, jam], public=true |
| `/calendar/hours.ics` | `firebase-maple-functions-calendar-hours-feed` | `calendarEvents` where type=hours, public=true |

Also create a combined `/calendar/all.ics` that includes everything public.

Each function:
1. Queries Firestore via the calendar event repository (filtered by type + public)
2. Calls `generateIcsFeed()` from the shared library
3. Returns with headers:
   - `Content-Type: text/calendar; charset=utf-8`
   - `Cache-Control: public, max-age=300` (5 min)
   - `X-PUBLISHED-TTL: PT5M`
   - `Content-Disposition: inline`

**Important:** These must be `onRequest` HTTP functions, not `onCall` callable functions, so they can serve ICS content directly to calendar clients and the public website.

### 4d. Firebase Hosting rewrite (optional)

In `firebase.json`, add rewrites so `/calendar/classes.ics` routes to the Cloud Function. This gives cleaner URLs than the default `us-east4-maple-and-spruce.cloudfunctions.net/...` paths.

---

## Step 5: Public Calendar Page

### 5a. Install dependencies

```bash
pnpm add @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/list @fullcalendar/icalendar
```

### 5b. Create the `/calendar` route

**Location:** `apps/maple-spruce/src/app/calendar/`

This is a **public** page (no auth required), like `/register`.

FullCalendar component with:
- Multiple event sources, each with a color from the MUI theme (use theme tokens, never hardcoded hex):
  - Classes feed (Sage Green / primary)
  - Music feed (secondary)
  - Events/jams feed (tertiary or warning)
  - Katie's ad-hoc Google Calendar (info)
- View toggle: month, week, list
- Default to list view on mobile (use MUI `useMediaQuery`)
- Store hours as background events (`display: 'background'`)
- Legend component showing color coding
- "Subscribe" section with copyable ICS URLs

### 5c. Google Calendar ICS proxy

Katie's ad-hoc Google Calendar's public ICS URL may have CORS issues when fetched client-side. Create a thin proxy:

**Function:** `firebase-maple-functions-calendar-adhoc-proxy`
**Type:** `onRequest` HTTP function

Fetches the Google Calendar ICS URL (stored in Firebase config / environment variable), forwards the response with proper CORS headers. Cache for 5 minutes.

### 5d. Event click-through

When a user clicks a class event on the calendar, link to `/register/{classId}`. Use the `sourceRef` field on the CalendarEvent to extract the class ID. Implement via FullCalendar's `eventClick` handler.

### 5e. Webflow link

Add a "Calendar" navigation link on the Webflow marketing site pointing to the `/calendar` route on the Next.js app. Same pattern as the existing link to `/register`.

---

## Step 6: Katie's Google Calendar Setup (Manual)

Not code. Document in a README or guide:

1. Katie creates a new Google Calendar called "M&S Ad Hoc" in her Workspace account
2. In calendar settings, turns on "Make available to public" and copies the public ICS URL
3. That URL goes into Firebase config (consumed by the proxy in Step 5c)
4. She subscribes to each Firestore ICS feed URL via "Add calendar > From URL" in Google Calendar
5. She assigns colors to each subscribed calendar

---

## Step 7: Tests and Verification

- [ ] Unit tests for `CalendarEvent` domain helpers
- [ ] Unit tests for Vest validation suite
- [ ] Unit tests for `generateIcsFeed()` (parse output with `node-ical`, assert events, recurrence, timezone)
- [ ] Unit tests for each Cloud Function (mock repository, verify response headers and content)
- [ ] Create a test event via admin UI, confirm it appears in the ICS feed (curl the endpoint)
- [ ] Subscribe to a feed in Google Calendar, confirm events appear
- [ ] Create a class via existing class admin, confirm `onClassWrite` generates a CalendarEvent
- [ ] Load `/calendar`, confirm all sources render with correct colors
- [ ] Toggle month/week/list views
- [ ] Test on mobile viewport (list view default)
- [ ] Toggle an event's `public` field to `false`, confirm it disappears from the feed
- [ ] Verify Webflow link to `/calendar` works
- [ ] Run `pnpm test` -- all passing

---

## New Libraries Summary

| Library | Location | Purpose |
|---------|----------|---------|
| `@maple/domain` (update) | `libs/ts/domain/` | Add `CalendarEvent` types |
| `@maple/database` (update) | `libs/firebase/database/` | Add `calendar-event.repository.ts` |
| `@maple/validation` (update) | `libs/ts/validation/` | Add `calendar-event.validation.ts` |
| `@maple/calendar` (new) | `libs/ts/calendar/` | ICS feed generation (pure, no Firebase deps) |
| `@maple/react/events` (new or update) | `libs/react/events/` or `libs/react/data/` | Admin data hooks for calendar events |

## New Cloud Functions Summary

| Function | Library | Type |
|----------|---------|------|
| `createCalendarEvent` | `firebase-maple-functions-create-calendar-event` | callable |
| `updateCalendarEvent` | `firebase-maple-functions-update-calendar-event` | callable |
| `deleteCalendarEvent` | `firebase-maple-functions-delete-calendar-event` | callable |
| `getCalendarEvents` | `firebase-maple-functions-get-calendar-events` | callable |
| `getCalendarEvent` | `firebase-maple-functions-get-calendar-event` | callable |
| `onClassWrite` | `firebase-maple-functions-on-class-write` | Firestore trigger |
| `calendarClassesFeed` | `firebase-maple-functions-calendar-classes-feed` | HTTP (`onRequest`) |
| `calendarMusicFeed` | `firebase-maple-functions-calendar-music-feed` | HTTP (`onRequest`) |
| `calendarEventsFeed` | `firebase-maple-functions-calendar-events-feed` | HTTP (`onRequest`) |
| `calendarHoursFeed` | `firebase-maple-functions-calendar-hours-feed` | HTTP (`onRequest`) |
| `calendarAllFeed` | `firebase-maple-functions-calendar-all-feed` | HTTP (`onRequest`) |
| `calendarAdhocProxy` | `firebase-maple-functions-calendar-adhoc-proxy` | HTTP (`onRequest`) |

## Dependencies to Add

| Package | Type | Purpose |
|---------|------|---------|
| `ical-generator` | production | Generate ICS calendar feeds |
| `@fullcalendar/react` | production | Calendar UI component |
| `@fullcalendar/daygrid` | production | Month/day grid views |
| `@fullcalendar/timegrid` | production | Week/day time views |
| `@fullcalendar/list` | production | List view (mobile-friendly) |
| `@fullcalendar/icalendar` | production | ICS event source plugin |
| `node-ical` | dev | Test helper for parsing/asserting ICS output |

## Open Questions

1. **Store hours as events or static config?** Storing Wed/Fri/Sat noon-6pm as recurring CalendarEvents is the most uniform approach, but they could also be hardcoded in the hours feed function since they rarely change. Recommendation: store as CalendarEvents so Katie can adjust seasonally via the admin UI.
2. **Firebase Hosting rewrites for feed URLs?** Cleaner URLs but adds config. Worth doing for the public-facing feeds.
3. **FullCalendar license:** Standard package is MIT (free). Premium plugins not needed.
4. **Should `/calendar` be a new Next.js app or a route in `maple-spruce`?** Recommendation: route in `maple-spruce` (same as `/register`). It's a public page, no auth required.
