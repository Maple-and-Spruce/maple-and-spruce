# Implementation Status

> Update this document as features are built. Mark features "In progress" or "Complete".

---

## Infrastructure

| Feature | Status | Location |
|---------|--------|----------|
| Firebase client SDK | Complete | `libs/ts/firebase/firebase-config/` |
| Firebase admin SDK | Complete | `libs/firebase/database/` |
| MUI theme | Complete | `libs/react/theme/` |
| React UI components | Complete | `libs/react/ui/` (ImageUpload, DeleteConfirmDialog) |
| React auth library | Complete | `libs/react/auth/` (AuthGuard, AdminGuard, UserMenu, useAuth, useAdminStatus) |
| React layout library | Complete | `libs/react/layout/` (AppShell) |
| React data hooks | Complete | `libs/react/data/` (useProducts, useArtists, useCategories) |
| Domain types library | Complete | `libs/ts/domain/` |
| Validation library | Complete | `libs/ts/validation/` |
| API types library | Complete | `libs/ts/firebase/api-types/` |
| Functions core library | Complete | `libs/firebase/functions/` |
| Functions app | Complete | `apps/functions/` |
| Authentication | Complete | `libs/react/auth/` (re-exported via app barrel) |
| Admin authorization (UI) | Complete | `AdminGuard` + `useAdminStatus` + `checkAdminStatus` Cloud Function |
| Navigation (responsive) | Complete | `libs/react/layout/` (re-exported via app barrel) |
| Storybook | Complete | `apps/maple-spruce/.storybook/` |
| Component stories | Complete | `apps/maple-spruce/src/components/**/*.stories.tsx`, `libs/react/*/src/**/*.stories.tsx` |
| Chromatic CI | Complete | `.github/workflows/chromatic.yml` |
| Unit testing (Vitest) | Complete | `libs/ts/validation/`, `libs/ts/domain/` |
| Unit tests in CI | Complete | `.github/workflows/build-check.yml` |
| Signals state management | Complete | `libs/react/signals/` (see ADR-015) |
| Sync conflict detection | Complete | `libs/firebase/maple-functions/detect-sync-conflicts/`, UI at `/sync-conflicts` |

## Phase 1 Features (COMPLETE)

| Feature | Status | Issue | Location |
|---------|--------|-------|----------|
| Artist CRUD | Complete | #2 | `libs/firebase/maple-functions/get-artists/`, etc. |
| Square integration | Complete | #69 | `libs/firebase/square/` |
| Product management | Complete | #3 | `libs/firebase/maple-functions/get-products/`, etc. |
| Category management | Complete | - | `libs/firebase/maple-functions/get-categories/`, etc. |

## Phase 2 Features (COMPLETE)

| Feature | Status | Issue | Location |
|---------|--------|-------|----------|
| Public Artist API | Removed | #93 | Superseded by `syncArtistToWebflow` push to Webflow CMS |
| Webflow integration | Complete | #93 | `libs/firebase/webflow/`, `syncArtistToWebflow` |
| Sync Conflict Resolution | Complete | #28 | `/sync-conflicts` page, 4 Cloud Functions |
| Artist showcase | Complete | #93 | Webflow CMS sync working |

## Phase 3 Features (COMPLETE)

| Feature | Status | Issue | Location |
|---------|--------|-------|----------|
| **Phase 3a: Backend** | | | |
| Payee interface | Complete | #9 | `libs/ts/domain/src/lib/payee.ts` |
| Instructor domain types | Complete | #9 | `libs/ts/domain/src/lib/instructor.ts` |
| Class domain types | Complete | #9 | `libs/ts/domain/src/lib/class.ts` |
| ClassCategory types | Complete | #9 | `libs/ts/domain/src/lib/class-category.ts` |
| Registration placeholder | Complete | #9 | `libs/ts/domain/src/lib/registration.ts` |
| Instructor validation | Complete | #9 | `libs/ts/validation/src/lib/instructor.validation.ts` |
| Class validation | Complete | #9 | `libs/ts/validation/src/lib/class.validation.ts` |
| InstructorRepository | Complete | #9 | `libs/firebase/database/src/lib/instructor.repository.ts` |
| ClassRepository | Complete | #9 | `libs/firebase/database/src/lib/class.repository.ts` |
| ClassCategoryRepository | Complete | #9 | `libs/firebase/database/src/lib/class-category.repository.ts` |
| Instructor Cloud Functions (5) | Complete | #9 | `libs/firebase/maple-functions/get-instructors/`, etc. |
| Class Cloud Functions (7) | Complete | #9 | `libs/firebase/maple-functions/get-classes/`, etc. |
| ClassCategory Cloud Functions (1) | Complete | #9 | `libs/firebase/maple-functions/get-class-categories/` |
| **Phase 3b: Admin UI** | | | |
| Instructor components | Complete | #9 | `libs/react/instructors/` |
| Class components | Complete | #9 | `libs/react/classes/` |
| Instructors page | Complete | #9 | `/instructors` admin page |
| Classes page | Complete | #9 | `/classes` admin page |
| useInstructors hook | Complete | #9 | `apps/maple-spruce/src/hooks/useInstructors.ts` |
| useClasses hook | Complete | #9 | `apps/maple-spruce/src/hooks/useClasses.ts` |
| Storybook stories | Complete | #9 | `libs/react/*/src/**/*.stories.tsx` |
| **Phase 3c: Registration** | | | |
| Discount domain types + validation | Complete | #9 | `libs/ts/domain/src/lib/discount.ts`, `libs/ts/validation/src/lib/discount.validation.ts` |
| Discount Cloud Functions (6) | Complete | #9 | `libs/firebase/maple-functions/get-discounts/`, etc. |
| Registration domain types + validation | Complete | #9 | `libs/ts/domain/src/lib/registration.ts`, `libs/ts/validation/src/lib/registration.validation.ts` |
| Registration Cloud Functions (5) | Complete | #9 | `libs/firebase/maple-functions/get-registrations/`, etc. |
| Square PaymentsService | Complete | #9 | `libs/firebase/square/src/lib/payments.service.ts` |
| createRegistration (public, with payment) | Complete | #9 | `libs/firebase/maple-functions/create-registration/` |
| cancelRegistration (admin, with refund) | Complete | #9 | `libs/firebase/maple-functions/cancel-registration/` |
| Enhanced getPublicClass | Complete | #9 | Instructor names, categories, spot counts (single-class endpoint; `getPublicClasses` removed in favor of Webflow CMS list) |
| Admin UI (Discounts + Registrations pages) | Complete | #9 | `/discounts`, `/registrations` |
| Public registration flow | Complete | #9 | Webflow embed via `apps/webflow-components/src/RegistrationWidget.tsx` (admin-app POC `/register` pages removed) |
| useDiscounts + useRegistrations hooks | Complete | #9 | `libs/react/data/src/lib/` |
| Storybook fixtures | Complete | #9 | `apps/maple-spruce/.storybook/fixtures/` |

## Webflow Go-Live (COMPLETE)

Site is published and live with Facebook/Instagram ads running. Closed issues: #112, #126, #127, #129, #131, #132, #135, #137.

| Feature | Status | Issue | Notes |
|---------|--------|-------|-------|
| Pre-opening messaging | **Complete** | - | Banner in maple-nav component (all pages), `pre-opening-banner` style, contact link |
| Content accuracy fixes | **Complete** | [#113](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/113) | Jam times, typos, open hours refs fixed |
| Fix broken nav links | **Complete** | [#113](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/113) | 5 broken hrefs in maple-nav fixed |
| Our Story text update | **Complete** | - | "soft opening mid-2026" → "Opening May 2026" |
| Music Lessons page | **Complete** | - | `/music-lessons` — pricing, policies, instrument loan program |
| Craft Classes page | **Complete** | - | `/classes` — 6 class offerings with pricing, pathway, policies |
| Shop page | **Complete** | - | `/shop` — What we carry, Etsy link, consignment info |
| Navigation updated | **Complete** | - | Music Lessons + Shop added to maple-nav dropdowns |
| SEO on new pages | **Complete** | - | All 3 new pages have SEO titles + descriptions + OG tags |
| Publish site | **Complete** | - | Site is live |

**Post-launch quality improvements (remaining):**

| Feature | Status | Issue | Notes |
|---------|--------|-------|-------|
| Fix Artists page 404 | Pending | [#114](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/114) | CMS template page returns 404 |
| Clean CMS test data | Pending | [#114](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/114) | Replace with real artist profiles |
| SEO metadata (existing pages) | Pending | [#115](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/115) | Some existing pages still need SEO |
| Google Analytics setup | Pending | [#116](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/116) | No tracking configured |
| Fix Webflow style inconsistencies | Pending | [#117](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/117) | Hardcoded colors, style bugs |
| Image alt text | Pending | [#118](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/118) | ~10 images missing alt text |
| Clean up class names/styles | Pending | [#119](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/119) | 37 default names, 311 empty styles |
| Canonical domain + sitemap | Pending | [#120](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/120) | Dual domains, sitemap 404 |
| Responsive bug fixes | Pending | [#121](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/121) | Card padding, visual bugs |
| Align admin MUI theme to Webflow | Pending | [#122](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/122) | Update MUI colors to match Webflow |

## Phase: Webflow Customer Interactions (In Progress)

Phased rollout of customer-facing interactions on the Webflow site.

| Epic | Status | Issue | Notes |
|------|--------|-------|-------|
| **A: Artists on Webflow** | Not Started | [#161](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/161) | Artist profiles synced to Webflow CMS |
| **B: Class Browsing on Webflow** | Not Started | [#162](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/162) | Public class listings on Webflow |
| **C: Payment & Registration Testing** | **In Progress** | [#163](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/163) | End-to-end payment tested in dev with Square sandbox |
| **D: Class Registration with Payment** | **In Progress** | [#164](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/164) | React Code Component working on Webflow (PR #201) |

### Webflow Registration Component (PR #201)

| Feature | Status | Location |
|---------|--------|----------|
| Webflow Code Component library | **Complete** | `apps/webflow-components/` |
| Registration widget (React) | **Complete** | `apps/webflow-components/src/RegistrationWidget.tsx` |
| Shadow DOM + MUI styling | **Complete** | `@webflow/emotion-utils` decorator |
| Shadow DOM + Square SDK | **Complete** | External card mount workaround in `SquareCardForm.tsx` |
| Published to workspace | **Complete** | Katie's Workspace, "Maple & Spruce Components" |
| Test page | **Complete** | `mapleandsprucefolkarts.com/test-class-enrollment` |
| CMS-bound class pages | Not Started | Needs #139-145, #202 |

### Image2Pages Widget (PR pending)

| Feature | Status | Location |
|---------|--------|----------|
| Image tiling library (pure browser) | **Complete** | `apps/webflow-components/src/lib/image2pages-tile.ts` |
| Unit tests for tiling logic | **Complete** | `apps/webflow-components/src/lib/image2pages-tile.spec.ts` (16 tests) |
| Image2Pages React widget | **Complete** | `apps/webflow-components/src/Image2PagesWidget.tsx` |
| Webflow component declaration | **Complete** | `apps/webflow-components/src/image2pages.webflow.tsx` |
| Published to workspace | **Complete** | `webflow library share` published to Katie's Workspace |
| Embedded on a Webflow page | **Complete** | New "Pattern Scaling Tool" page (`/untitled` slug, draft) with maple-nav + Image to Pages + Footer |

### Customer Self-Service (Backend only, PR pending)

| Feature | Status | Location |
|---------|--------|----------|
| `lookupRegistration` Cloud Function | **Complete** | `libs/firebase/maple-functions/lookup-registration/` |
| `cancelRegistrationPublic` Cloud Function | **Complete** | `libs/firebase/maple-functions/cancel-registration-public/` |
| `confirmationNumber` on Registration type | **Complete** | `libs/ts/domain/src/lib/registration.ts` |
| `findByConfirmationNumber` repository method | **Complete** | `libs/firebase/database/src/lib/registration.repository.ts` |
| Frontend lookup/cancel page | Not Started | #199 |

## Phase 4: Music Lessons - Epic #10

### Teacher Payout Tracking (#283, Complete)

Closes the last follow-up under epic #10. Aggregates what Katie owes each teacher in a date range from two sources: **paid private-pay invoice lines** (via `lessonId` linkback from #280) and **rendered Hope Scholarship lessons** (since Hope is invoiced externally, the rendered status is the signal). Substitutes get credit via a snapshotted `primaryTeacherAtCreateId` on each lesson so later reassignment of a student's primary teacher doesn't retroactively flip attribution.

| Feature | Status | Location |
|---------|--------|----------|
| `Lesson.primaryTeacherAtCreateId` snapshot + stamped on create | **Complete** | `libs/ts/domain/src/lib/lesson.ts` + `create-lesson*/src/lib/*.ts` |
| `wasTaughtBySubstitute` domain helper | **Complete** | `libs/ts/domain/src/lib/lesson.ts` |
| Hope rates moved to domain (shared with payout calc) | **Complete** | `libs/ts/domain/src/lib/hope-rates.ts` |
| `teacher-payout.ts` — aggregator + compensation helpers | **Complete** | `libs/ts/domain/src/lib/teacher-payout.ts` (+ 26 unit tests) |
| `getTeacherPayouts` cloud function (admin, date range + optional teacher filter) | **Complete** | `libs/firebase/maple-functions/get-teacher-payouts/` |
| Unit test for handler (7) + integration test (end-to-end with mixed sources, substitute flag, teacher filter, empty period) | **Complete** | `apps/functions-integration-tests-teacher-payout/` |
| `useTeacherPayouts` hook | **Complete** | `libs/react/data/src/lib/useTeacherPayouts.ts` |
| `PeriodPicker` + `TeacherPayoutsList` (expandable per teacher, Hope/Private/Sub chips, "Rate not set" warning) | **Complete** | `libs/react/payouts/` |
| Storybook interaction tests (14) | **Complete** | `libs/react/payouts/src/lib/*.stories.tsx` |
| `/payouts` admin page + Music Lessons nav entry | **Complete** | `apps/maple-spruce/src/app/payouts/page.tsx`, `AppShellWrapper.tsx` |

### Parent Invoice Delivery + Online Payment (#281, Complete)

Uses Square Invoices API rather than a custom Webflow payment page — Square sends the parent the email + hosted payment page, handles receipts and reminders, and webhooks us back when paid.

| Feature | Status | Location |
|---------|--------|----------|
| Invoice extended with `paymentRecord` / `squareOrderId` / `squareInvoiceId` / `squareSyncError` | **Complete** | `libs/ts/domain/src/lib/invoice.ts` |
| `InvoicesService` wrapper (Square Customers + Orders + Invoices APIs) | **Complete** | `libs/firebase/square/src/lib/invoices.service.ts` |
| `syncInvoiceToSquare` Firestore trigger (draft → sent → Square; sent → void → cancel) | **Complete** | `libs/firebase/maple-functions/sync-invoice-to-square/` |
| `square-webhook` extended to handle `invoice.payment_made` | **Complete** | `libs/firebase/maple-functions/square-webhook/src/lib/square-webhook.ts` |
| `InvoiceRepository.markPaidBySquareWebhook` + `findBySquareInvoiceId` | **Complete** | `libs/firebase/database/src/lib/invoice.repository.ts` |
| Payment attribution — manual mark-paid stamps `source: 'admin-manual'` | **Complete** | `InvoiceRepository.update` stamp on paid transition |
| `InvoiceList` surfaces "Paid via Square" / "Marked paid manually" / sync-error chips | **Complete** | `libs/react/invoices/src/lib/InvoiceList.tsx` |
| Unit tests: webhook handler + invoice domain paymentRecord shapes | **Complete** | 4 new (13 total in square-webhook.spec) + 2 new in invoice.spec |
| Integration test: manual mark-paid stamps admin-manual attribution | **Complete** | `apps/functions-integration-tests-invoice/` |
| Storybook interaction tests: attribution badges, sync-error badge | **Complete** | 4 new (32 total in Invoices family) |
| Drive-by: migrated `invoiceValidation` from `create` → `staticSuite` | **Complete** | matches #293 |

### Invoice Initiation — Private Pay (#280, Complete)

| Feature | Status | Location |
|---------|--------|----------|
| Invoice domain type + status transition rules | **Complete** | `libs/ts/domain/src/lib/invoice.ts` (+ 26 unit tests) |
| Invoice Vest validation | **Complete** | `libs/ts/validation/src/lib/invoice.validation.ts` (+ 17 tests) |
| InvoiceRepository (CRUD + issuedAt/paidAt stamps + totals) | **Complete** | `libs/firebase/database/src/lib/invoice.repository.ts` |
| API types | **Complete** | `libs/ts/firebase/api-types/src/lib/invoice.types.ts` |
| Cloud functions (create/get/update/delete) | **Complete** | `libs/firebase/maple-functions/{create,get,update,delete}-invoice*/` |
| **Hope Scholarship server guard** on `createInvoice` | **Complete** | `create-invoice.ts` rejects when `student.isHopeScholarship` |
| **Status-transition enforcement** on `updateInvoice` | **Complete** | `isInvoiceStatusTransitionAllowed` rejects e.g. paid → sent |
| **Draft-only hard delete** on `deleteInvoice` | **Complete** | `isInvoiceDeletable` — sent/paid/void require void instead |
| Integration tests (auth, Hope guard, CRUD lifecycle, transitions, delete-while-draft) | **Complete** | `apps/functions-integration-tests-invoice/` |
| `useInvoices` hook | **Complete** | `libs/react/data/src/lib/useInvoices.ts` |
| `InvoiceList` (status-aware action buttons) | **Complete** | `libs/react/invoices/src/lib/InvoiceList.tsx` |
| `InvoiceBuilderDialog` (signals, Vest, "Add from lesson" picker) | **Complete** | `libs/react/invoices/src/lib/InvoiceBuilderDialog.tsx` |
| Storybook interaction tests | **Complete** | 28 new (action visibility per status, line editing, picker, totals) |
| Wired into `/students/[id]` with Hope guard in UI | **Complete** | `apps/maple-spruce/src/app/students/[id]/page.tsx` |
| Parent invoice email + online payment | **Deferred to #281** | |

### Hope Scholarship Handling (#282, Complete)

| Feature | Status | Location |
|---------|--------|----------|
| Hope flag on Student (set/unset by Katie) | **Complete** | shipped in #278 |
| Hope per-lesson rate constants + helpers | **Complete** | `libs/react/lessons/src/lib/hope-rates.ts` (+ 7 unit tests) |
| `HopeRatesTable` (4-tier, highlight current) | **Complete** | `libs/react/lessons/src/lib/HopeRatesTable.tsx` |
| `HopeScholarshipBanner` on student detail | **Complete** | `libs/react/lessons/src/lib/HopeScholarshipBanner.tsx` |
| Mark-lesson-rendered action (past scheduled lessons) | **Complete** | `LessonList.tsx` + `/students/[id]/page.tsx` |
| Hope filter on `/students` (All / Hope / Private) | **Complete** | `/students/page.tsx` |
| Exclude Hope students from in-app invoice flow | **Deferred to #280** | invoice flow doesn't exist yet |
| Rendered lessons feed teacher payouts | **Data ready** | `Lesson.status='rendered'` records exist; aggregation in #283 |
| Storybook interaction tests | **Complete** | 18 new (rates table, banner, mark-rendered on LessonList) |

### Lesson Scheduling (#279, Complete)

| Feature | Status | Location |
|---------|--------|----------|
| Lesson domain type (status incl. `rendered` for #282 forward-compat) | **Complete** | `libs/ts/domain/src/lib/lesson.ts` |
| Lesson + LessonSeries validation (Vest) | **Complete** | `libs/ts/validation/src/lib/lesson.validation.ts` |
| LessonRepository (CRUD + atomic series batch write) | **Complete** | `libs/firebase/database/src/lib/lesson.repository.ts` |
| Lesson API types | **Complete** | `libs/ts/firebase/api-types/src/lib/lesson.types.ts` |
| Lesson Cloud Functions (5) | **Complete** | `libs/firebase/maple-functions/{create,create-series,get,update,delete}-lesson*/` |
| Lesson unit + integration tests | **Complete** | `libs/ts/{domain,validation}/src/lib/lesson*.spec.ts`, `apps/functions-integration-tests-lesson/` |
| useLessons hook (scoped by studentId) | **Complete** | `libs/react/data/src/lib/useLessons.ts` |
| Recurring-date generation helper + tests | **Complete** | `libs/react/lessons/src/lib/series-dates.ts` |
| LessonList + ScheduleLessonDialog + EditLessonDialog (signals, Vest) | **Complete** | `libs/react/lessons/src/lib/` |
| Storybook interaction tests (20) | **Complete** | `libs/react/lessons/src/lib/*.stories.tsx` |
| Student detail page `/students/[id]` | **Complete** | `apps/maple-spruce/src/app/students/[id]/page.tsx` |
| Student list row links to detail page | **Complete** | `StudentList.tsx` + `/students/page.tsx` |

### Student Records (#278, Complete)

| Feature | Status | Location |
|---------|--------|----------|
| Student domain type (w/ Instrument + LessonLength enums) | **Complete** | `libs/ts/domain/src/lib/student.ts` |
| Student validation (Vest) | **Complete** | `libs/ts/validation/src/lib/student.validation.ts` |
| StudentRepository | **Complete** | `libs/firebase/database/src/lib/student.repository.ts` |
| Student API types | **Complete** | `libs/ts/firebase/api-types/src/lib/student.types.ts` |
| Student CRUD Cloud Functions (5) | **Complete** | `libs/firebase/maple-functions/{create,get,get-list,update,delete}-student/` |
| Student unit + integration tests | **Complete** | `libs/ts/{domain,validation}/src/lib/student*.spec.ts`, `apps/functions-integration-tests-student/` |
| useStudents hook | **Complete** | `libs/react/data/src/lib/useStudents.ts` |
| StudentList + StudentForm (Preact signals, Vest) | **Complete** | `libs/react/students/src/lib/` |
| Storybook interaction tests (24) | **Complete** | `libs/react/students/src/lib/*.stories.tsx` |
| Admin /students page + Music Lessons nav group | **Complete** | `apps/maple-spruce/src/app/students/page.tsx`, `AppShellWrapper.tsx` |

## Phase 4.5: Calendar System (Complete)

| Feature | Status | Location |
|---------|--------|----------|
| CalendarEvent domain type | **Complete** | `libs/ts/domain/src/lib/calendar-event.ts` |
| CalendarEvent validation | **Complete** | `libs/ts/validation/src/lib/calendar-event.validation.ts` |
| CalendarEventRepository | **Complete** | `libs/firebase/database/src/lib/calendar-event.repository.ts` |
| Calendar API types | **Complete** | `libs/ts/firebase/api-types/src/lib/calendar-event.types.ts` |
| Calendar CRUD Cloud Functions (5) | **Complete** | `libs/firebase/maple-functions/{get,create,update,delete}-calendar-event{,s}/` |
| useCalendarEvents hook | **Complete** | `libs/react/data/src/lib/useCalendarEvents.ts` |
| Calendar event components | **Complete** | `libs/react/events/` (CalendarEventList, CalendarEventForm, CalendarEventFilterToolbar) |
| Admin /events page | **Complete** | `apps/maple-spruce/src/app/events/page.tsx` |
| ICS feed generation library | **Complete** | `libs/ts/calendar/` |
| ICS feed Cloud Functions (6) | **Complete** | 5 feeds + adhoc proxy (`calendarClassesFeed`, etc.) |
| onClassWrite Firestore trigger | **Complete** | Auto-generates CalendarEvents from published classes |
| Firebase Hosting rewrites | **Complete** | `/calendar/*.ics` routes to feed functions |
| Public calendar display | **Complete** | Open Web Calendar (self-hosted on Vercel), embedded in Webflow via iframe. See ADR-025. |

## Spruce Room Availability — Epic #467 (In Progress)

The Spruce Room is multi-tenant (music lessons, Music Together, ad hoc uses). Room occupancy is tracked via `CalendarEvent.room`; the portal is the source of truth. See #467 for product decisions and architecture.

| Feature | Status | Location |
|---------|--------|----------|
| `Room` domain type + `getRoomStatus` logic | **Complete** (PR 1, #468) | `libs/ts/domain/src/lib/room.ts` |
| `room` field on CalendarEvent + Class | **Complete** (PR 1, #468) | flows through `onClassWrite` |
| `onLessonWrite` trigger (lessons → private room events) | **Complete** (PR 1, #468) | `libs/firebase/maple-functions/on-lesson-write/` |
| `getRoomSchedule` Cloud Function | **Complete** (PR 1, #468) | `libs/firebase/maple-functions/get-room-schedule/` |
| Dashboard "Spruce Room right now" widget | **Complete** (PR 1, #468) | `libs/react/events/src/lib/RoomStatusCard.tsx` |
| Ad hoc room booking form | Planned (PR 2, #469) | — |
| Day strip + conflict warnings in scheduling flows | Planned (PR 2, #469) | — |

## Admin User Management — Complete

Admin `/users` page lists every Firebase Auth user with admin status. Admins can grant or revoke the admin role on others. Self-protection: an admin cannot revoke their own admin role.

| Layer | Status | Path |
|------|--------|------|
| `AppUser` domain type | **Complete** | `libs/ts/domain/src/lib/app-user.ts` |
| API types | **Complete** | `libs/ts/firebase/api-types/src/lib/user.types.ts` |
| Cloud functions (`listUsers`, `grantAdminRole`, `revokeAdminRole`) | **Complete** | `libs/firebase/maple-functions/{list-users,grant-admin-role,revoke-admin-role}/` |
| `useUsers` data hook | **Complete** | `libs/react/data/src/lib/useUsers.ts` |
| `UserList` + `UserRolesDialog` components | **Complete** | `libs/react/users/` |
| `/users` admin page + nav link | **Complete** | `apps/maple-spruce/src/app/(admin)/users/page.tsx` |

## Timekeeping — Retired (2026-05-09)

Replaced by Square Shifts (clock-in via Square POS on iPad) feeding Square Payroll. The custom `/timesheet` and `/employees` pages plus the time-entry/employee Cloud Functions and `Role.Employee` were retired before any usage. Square is now the source of truth for hours, rates, and payroll.

## Deferred to Phase 5 (Store Opening)

| Feature | Status | Issue | Notes |
|---------|--------|-------|-------|
| Etsy integration | Deferred | #4 | Blocked on API approval |
| Sales tracking | Deferred | #5 | Not valuable without store |
| Payout reports | Deferred | #6 | Depends on sales |

## Square Integration (#69) - Complete

Square foundation is complete. Ready for Product Management integration.

| Task | Status | Notes |
|------|--------|-------|
| Square secrets configured | Complete | Per-project pattern (same name in dev/prod projects) |
| Square utility library | Complete | `libs/firebase/square/` with Catalog & Inventory services |
| Product type refactored | Complete | `squareCache` for cached data, clear ownership boundaries |
| ADR for sync strategy | Complete | ADR-013: webhooks + lazy refresh + periodic sync |
| Webhooks | Complete | `squareWebhook` function deployed to both environments |
| Dev environment | Complete | Separate Firebase project + Vercel app |

## Product Management (#3) - Complete

- ~~ProductForm status enum mismatch~~ - Fixed
- ~~ProductForm missing quantity field~~ - Fixed
- ~~Wire up CRUD to Square~~ - Product create/update calls Square first
- ~~Artist dropdown~~ - Replaced manual artistId text input
- ~~Artist info display~~ - Shows artist name in table
- **Category dropdown** - Products can be assigned to categories
- **MUI DataGrid table** - Replaced card grid with sortable/filterable table
- **Filter toolbar** - Search, category, artist, status, in-stock filters

## Category Management - Complete

| Task | Status | Notes |
|------|--------|-------|
| Category domain types | Complete | `libs/ts/domain/src/lib/category.ts` |
| Category API types | Complete | `libs/ts/firebase/api-types/src/lib/category.types.ts` |
| Category validation | Complete | `libs/ts/validation/src/lib/category.validation.ts` |
| CategoryRepository | Complete | `libs/firebase/database/src/lib/category.repository.ts` |
| Cloud Functions (4) | Complete | getCategories, createCategory, updateCategory, deleteCategory |
| useCategories hook | Complete | `apps/maple-spruce/src/hooks/useCategories.ts` |
| Categories page | Complete | `/categories` with full CRUD UI |
| ProductForm dropdown | Complete | Category selection in product form |

## Infrastructure Tasks (COMPLETE)

| Task | Status | Issue |
|------|--------|-------|
| Deploy Functions to Firebase | Complete | #22 |
| CI/CD for Functions | Complete | #23 |
| Testing infrastructure | Complete | #24 |

## Storybook & Testing Infrastructure (#24) - Complete

| Task | Status | Notes |
|------|--------|-------|
| Storybook setup | Complete | `@storybook/nextjs` v10 with Nx integration |
| Mock data fixtures | Complete | `apps/maple-spruce/.storybook/fixtures/` |
| Firebase mocks | Complete | `apps/maple-spruce/.storybook/mocks/firebase.ts` |
| ImageUpload stories | Complete | All states: idle, previewing, uploading, success, error, removed |
| DeleteConfirmDialog stories | Complete | All 3 variants (artists, categories, inventory) |
| Chromatic workflow | Complete | `.github/workflows/chromatic.yml` |
| Storybook build in CI | Complete | Added to `.github/workflows/build-check.yml` |
| Remaining component stories | Complete | All 15 components have stories with proper fixtures |
| Vitest workspace config | Complete | `vitest.workspace.ts` |
| Validation unit tests | Complete | 7 test files, 139 tests |
| Domain unit tests | Complete | `product.spec.ts`, 25 tests |
| Unit tests in CI | Complete | Added to `.github/workflows/build-check.yml` |
| Integration test app | Complete | `apps/functions-integration-tests/` (ADR-027) |
| Integration test utilities | Complete | Auth, Firestore, HTTP client helpers for emulator |
| calculateRegistrationCost tests | Complete | 24 tests covering all discount types, validation, eligibility |
| Artist CRUD starter tests | Complete | Auth guards + CRUD lifecycle |
| Integration tests in CI | Complete | Separate job with Java 21 + Firebase emulators |
| Firebase emulator config | Complete | Auth (9099), Firestore (8080) added to `firebase.json` |
| Vercel deployment | Pending | `storybook.maple-and-spruce.com` |
| Chromatic project token | Pending | Add `CHROMATIC_PROJECT_TOKEN` to GitHub secrets |

## Agreement & Waiver System - Epic #320

### Phase 1: Foundation (Complete, #321)

| Feature | Status | Location |
|---------|--------|----------|
| Domain types (template, request, signed agreement) | **Complete** | `libs/ts/domain/src/lib/agreement-*.ts` |
| Repositories (3 collections) | **Complete** | `libs/firebase/database/src/lib/agreement-*.repository.ts` |
| Validation suites (template + signing) | **Complete** | `libs/ts/validation/src/lib/agreement-*.validation.ts` |
| 12 Cloud Functions (CRUD, signing, admin) | **Complete** | `libs/firebase/maple-functions/*-agreement-*/` |
| Auto-attach agreements during registration | **Complete** | `libs/firebase/maple-functions/create-registration/` |
| Agreement request expiry cleanup | **Complete** | `libs/firebase/maple-functions/expire-agreement-requests/` |

### Phase 2: Signing Flow (Complete)

| Feature | Status | Location |
|---------|--------|----------|
| SigningForm component (signature_pad) | **Complete** | `libs/react/agreements/src/lib/SigningForm.tsx` |
| SignatureCanvas component | **Complete** | `libs/react/agreements/src/lib/SignatureCanvas.tsx` |
| Public signing page `/sign/:token` | **Complete** | `apps/maple-spruce/src/app/sign/[token]/page.tsx` |
| Kiosk mode support | **Complete** | `?kiosk=true` query param |
| Agreement template editor dialog | **Complete** | `libs/react/agreements/src/lib/AgreementTemplateForm.tsx` (#333) |

### Phase 3: Registration Integration (PR #343)

| Feature | Status | Location |
|---------|--------|----------|
| `signingRequirement` field on templates | **Complete** | `libs/ts/domain/src/lib/agreement-template.ts` |
| `getRequiredAgreementsForClass` Cloud Function | **Complete** | `libs/firebase/maple-functions/get-required-agreements-for-class/` |
| Required agreement validation before payment | **Complete** | `libs/firebase/maple-functions/create-registration/` |
| Inline signing step in checkout form | **Complete** | `libs/react/registrations/src/lib/RegistrationCheckoutForm.tsx` |
| Webflow widget agreement integration | **Complete** | `apps/webflow-components/src/RegistrationWidget.tsx` |
| Signing requirement admin UI | **Complete** | Radio group in `AgreementTemplateForm.tsx` |
| Confirmation email: signed vs deferred states | **Complete** | `tools/seed-email-templates.ts` |

### Phase 4: Enhancements (Not Started)

| Feature | Status | Issue |
|---------|--------|-------|
| SMS delivery via Twilio | Not Started | #335 |
| Kiosk mode improvements | Not Started | — |
| Bulk re-send | Not Started | — |
| PDF export | Not Started | — |

## External Dependencies

- [x] Firebase projects created (`maple-and-spruce` prod, `maple-and-spruce-dev` dev)
- [x] Square developer account (production & sandbox credentials configured)
- [x] Etsy developer account (app pending approval)
- [x] Vercel projects (prod + dev with hostname-based routing)
- [x] Dependencies added to package.json (vest, react-query, MUI, etc.)
