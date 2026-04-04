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
| Public Artist API | Complete | #93 | `libs/firebase/maple-functions/get-public-artists/` |
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
| Enhanced getPublicClasses + getPublicClass | Complete | #9 | Instructor names, categories, spot counts |
| Admin UI (Discounts + Registrations pages) | Complete | #9 | `/discounts`, `/registrations` |
| Public registration flow | Complete | #9 | `/register`, `/register/[classId]`, `/register/[classId]/confirm` |
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

### Customer Self-Service (Backend only, PR pending)

| Feature | Status | Location |
|---------|--------|----------|
| `lookupRegistration` Cloud Function | **Complete** | `libs/firebase/maple-functions/lookup-registration/` |
| `cancelRegistrationPublic` Cloud Function | **Complete** | `libs/firebase/maple-functions/cancel-registration-public/` |
| `confirmationNumber` on Registration type | **Complete** | `libs/ts/domain/src/lib/registration.ts` |
| `findByConfirmationNumber` repository method | **Complete** | `libs/firebase/database/src/lib/registration.repository.ts` |
| Frontend lookup/cancel page | Not Started | #199 |

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

## External Dependencies

- [x] Firebase projects created (`maple-and-spruce` prod, `maple-and-spruce-dev` dev)
- [x] Square developer account (production & sandbox credentials configured)
- [x] Etsy developer account (app pending approval)
- [x] Vercel projects (prod + dev with hostname-based routing)
- [x] Dependencies added to package.json (vest, react-query, MUI, etc.)
