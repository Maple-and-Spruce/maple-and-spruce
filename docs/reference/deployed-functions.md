# Deployed Functions

> All Cloud Functions deploy to `us-east4` (Northern Virginia).
> Functions are split into 6 codebases to reduce cold start times.
>
> **Every function on this page is one library under `libs/firebase/maple-functions/`,
> named after it.** The merge deploy builds its `--only` filter from the library directory
> name, so anything else a library exports is outside every filter and never created — which
> is how `chargeLessonsNow` and six admin `trigger*` twins were listed here while being
> absent from prod (legacy #872). `tools/check-function-library-names.ts` now fails a PR on it.
>
> **Public callables used by the widgets** declare `.withAppCheck()` and `.throttling()`
> (ADR-037): `createRegistration`, `createRegistrationCheckoutLink`,
> `createMusicTogetherRegistration`, `createCraftClubSubscription`,
> `updateCraftClubPaymentMethod`, `updateMusicTogetherPaymentMethod`, `lookupDiscount`,
> `requestCraftClubAccess`, `requestCraftClubManageLink`, `requestMusicTogetherManageLink`.
> Over a limit they answer 429 `RESOURCE_EXHAUSTED`. App Check currently runs in `monitor`.

## Codebase: `maple-core` (`apps/functions/`)

Core CRUD operations, auth, triggers, and admin functions. No heavy third-party dependencies.

### Artists
- `artists` — **domain router** (ADR-029). One function serving five routes:
  `artists/getArtists`, `artists/getArtist`, `artists/createArtist`,
  `artists/updateArtist`, `artists/deleteArtist`. Each route keeps its own role gate,
  validation and uniqueness checks.
  The five per-endpoint originals (`getArtists`, `getArtist`, `createArtist`,
  `updateArtist`, `deleteArtist`) were deleted once the router was verified in dev —
  five Cloud Run services replaced by one.
- `uploadArtistImage` — left off the router in this pilot to keep the change to the five
  CRUD endpoints. It is built with `createAdminFunction` rather than the
  `Functions.endpoint` chain, and it takes a base64 image body, so whether it wants its own
  memory limit is worth measuring before it moves.

### Products and categories (#68)
- `products` — **domain router** (ADR-029) for shop inventory in `maple-core`, every route
  gated `[Admin, Clerk]`: `products/getProducts`, `products/getProduct`,
  `products/deleteProduct`, `products/getCategories`, `products/createCategory`,
  `products/updateCategory`, `products/reorderCategories`, `products/deleteCategory`. The
  product writes that call Square are on the `productCatalog` router in `maple-square`; `uploadCategoryGalleryImage` serves class categories and waits for the
  classes router (#74).
- The eight per-endpoint originals are gone: deleted from dev and prod by hand on 2026-10-08,
  then removed from the codebase. Their Hosting rewrites in `firebase.json` went with them,
  along with the five that had pointed at the retired artist functions since #127.

### Instructors
- `getInstructors`, `getInstructor`, `createInstructor`, `updateInstructor`, `deleteInstructor`

### Music Lesson Students
- `people/getStudents`, `people/getStudent`, `people/createStudent`, `people/updateStudent`,
  `people/deleteStudent` — routes on the **`people` router** (ADR-029, #65), gated
  `[Admin, LessonTeacher]`; a lesson teacher is narrowed to their own students inside each route.

### Music Lessons
- `lessons` — **domain router** (ADR-029, #67), 22 routes, each keeping the gate it had as its
  own function:
  - `[Admin, LessonTeacher]`, a lesson teacher narrowed to their own inside each route:
    `getLessons`, `createLesson`, `createLessonSeries`, `updateLesson`, `deleteLesson`,
    `getLessonBlocks`, `getStudentLessonSchedules`, `createStudentLessonSchedule`,
    `updateStudentLessonSchedule`, `getMyDayLessons`, `getMyWeek`.
  - Admin-only: `createLessonBlock` (validated), `updateLessonBlock`, `deleteLessonBlock`,
    `getLessonInquiries`, `updateLessonInquiryStatus`, `getLessonBilling`, `saveLessonBillingRule`,
    `updateLessonScheduledCharge`, `getPosLessonAttributions`, `getPosLessonAttributionSummary`,
    `resolvePosLessonAttribution`.
  - Not on it: charging and Square card linking (`maple-square`, Square secrets), the Tally-keyed
    `triggerLessonInquirySync`, and the schedules and triggers below. The 22 per-endpoint originals
    were removed from the code in #67 and are deleted from each project by hand; CI does not prune.

### Lesson Inquiries (legacy #795)
- `syncLessonInquiries` _(scheduled, every 15 min — pulls submissions from the Tally API for the Suzuki form `QKQb6k` and the shared music form `dWPQOr` into `lessonInquiries`. Doc id = Tally submission id, written with `create()`, so a re-poll is a skip and never overwrites a status Katie has advanced. Deliberately NOT persisted from `tallyLeadWebhook`: that path is one-shot and unretryable, lives in the tiny `maple-webhooks` bundle, and cannot backfill history.)_
- `triggerLessonInquirySync` _(admin callable twin — `onSchedule` triggers are not reachable over HTTP in the emulator)_
- `lessons/getLessonInquiries`, `lessons/updateLessonInquiryStatus` _(admin; the `/leads` queue)_
- Requires the **`TALLY_API_KEY`** secret in each project's Secret Manager.

### Standing lesson schedules (legacy #797)
- `materializeLessonSchedules` and its admin twin `triggerMaterializeLessonSchedules` are **retired** (2026-10-09, ADR-034). Since #157 lessons are booked a few at a time when the family pays, not generated from the weekly time; the schedule had been a logged no-op, and the twin bypassed the pause. Both were removed from the code and deleted from each project by hand.
- `lessons/getStudentLessonSchedules`, `lessons/createStudentLessonSchedule`, `lessons/updateStudentLessonSchedule` _(admin + lesson-teacher, self-scoped; both create and update re-check block fit. Since #157 a weekly time books nothing: create no longer materialises lessons)_
- **Idempotence was structural** (historical: lessons generated before #157 still carry these ids). A materialised lesson's id was `sched-{scheduleId}-{YYYY-MM-DD}` in shop time, written with `create()`. A collision is the steady state — which is also what makes *skipping* a week (cancel that lesson) and *moving* one (edit its time) work with no exceptions table.
- `tools/backfill-lesson-schedules.ts` infers arrangements from existing `seriesId` lessons. Dry-run by default; `--apply` to write. Each inferred schedule starts the day **after** its series' last lesson, because pre-schedule lessons lack the deterministic id and would otherwise be duplicated.

### Needs Attention (legacy #807)
- `getNeedsAttention` _(admin + lesson-teacher, self-scoped — six states that were already true in the data and invisible: invoices that never reached Square, lessons taught but never invoiced, Hope lessons not yet claimed, invoices unpaid 14+ days, lessons in no block, active students with `autoInvoice` off. Fetches unfiltered and composes in memory, like `getTeacherPayouts`, so it needs **no** new composite index.)_
- Groups are ordered by cost of ignoring, not by count. Empty groups are dropped, and the panel renders nothing at all when the total is zero.

### Settings (#161)
- `settings` — **domain router** (ADR-029) for app-level lists edited on Settings. Routes:
  `settings/getInstruments` _(Admin + LessonTeacher — the instruments the studio teaches, from
  `appConfig/instruments`, defaulting to violin, fiddle, guitar, harp)_ and
  `settings/saveInstruments` _(Admin — replaces the list; keys must be unique and well formed.
  Removing one only stops it being offered: students and instructor rates on it keep it)_.
- The singleton app-config pairs joined the router (#156), each route keeping its old
  function's name and admin-only gate: `settings/getLessonRatesConfig` /
  `settings/updateLessonRatesConfig` _(default private-pay rate by lesson length; drops
  non-positive and non-integer entries)_, `settings/getBusinessPaymentConfig` /
  `settings/updateBusinessPaymentConfig` _(the studio Venmo handle, stored without its @)_ and
  `settings/getPosLessonConfig` / `settings/updatePosLessonConfig` _(the Square catalog ids
  that count as lessons at the POS; trimmed and de-duped)_.
- The six per-endpoint originals (`getLessonRatesConfig`, `updateLessonRatesConfig`,
  `getBusinessPaymentConfig`, `updateBusinessPaymentConfig`, `getPosLessonConfig`,
  `updatePosLessonConfig`) were deleted by hand once the routes were live, then dropped from
  the codebase — six Cloud Run services replaced by routes on one that already existed.

### Hope Scholarship billing (legacy #799)
- `hope` — **domain router** (ADR-029) for the WV Hope Scholarship. Routes:
  `hope/getHopeProducts`, `hope/saveHopeProduct`, `hope/saveHopeOrder`, `hope/getHopeQueue`, `hope/recordHopeSubmissions` _(admin — the studio's EMA portal
  products: EMA id, name, price per lesson. A Hope student's `hopeProductId` sets what
  their lessons are worth in the queue, on the claim and in teacher payouts. `saveHopeOrder`
  records an EMA order: product, lesson count, EMA order id; price copied from the product;
  its count cannot drop below lessons already invoiced against it)_. `getHopeQueue` returns
  each lesson's state (needs an order / ready to invoice / invoiced) and the orders with room
  left; `recordHopeSubmissions` refuses to invoice a lesson no order has room for.
- `hope/getHopeQueue` _(admin; a route since #67, formerly its own function — rendered lessons for Hope students plus what has been claimed from EMA. Starts from Hope students and fans out to lessons, since Hope-ness lives on the Student. No-shows are excluded structurally via `isSubmittableToHope`, never by a UI filter.)_
- `hope/recordHopeSubmissions` _(admin, bulk; a route since #67 — records `submitted` / `paid` / `rejected`. Re-checks every lesson server-side; a refused lesson is skipped and reported so one bad id can't lose a whole batch. The claimed rate is stamped once and never restated by a later rate change.)_
- `createLessonSeries` now accepts `status` — set `rendered` with past dates to **backfill lessons already taught**. Block attribution is waived for that case only (see `isBackfillSeries`); a future-dated series without a block is still refused.
- Claims live in `hopeSubmissions`, keyed by lesson id — one lesson, one claim. `Invoice` remains closed to Hope students.

### Music Lesson Invoices (private-pay)
- `getInvoices`, `createInvoice`, `updateInvoice`, `deleteInvoice`
- `recordInvoicePayment` _(records an off-Square payment against a sent invoice — `admin-manual` (cash/check) or `venmo-manual` (Venmo QR witnessed at a lesson); idempotent, admin-gated; see epic #51)_
- `syncInvoiceToSquare` _(Firestore trigger on `invoices/{id}` — sends via Square Invoices API on draft → sent, cancels on sent → void)_
- `squareWebhook` now additionally handles `invoice.payment_made` → flips matching invoice to `paid` with `paymentRecord.source = 'square-webhook'`

### Payouts
- `payouts` — **domain router** (ADR-029), admin-only on every route. Class-instructor
  statements (ADR-035):
  `payouts/previewClassInstructorPayouts`, `payouts/generateClassInstructorStatement`,
  `payouts/getClassInstructorStatements`, `payouts/getClassInstructorStatement`,
  `payouts/markClassInstructorStatementPaid`, `payouts/voidClassInstructorStatement`.
  It computes and records; it never moves money.
  - Artist consignment payouts (legacy #313), formerly `getPayouts` / `generatePayout` /
    `markPayoutPaid`: `payouts/getArtistPayouts` (filters: artistId, status),
    `payouts/generateArtistPayout` (aggregates an artist's unpaid sales over a date range,
    then writes the payout and stamps each sale with its id **in one transaction**, so a sale
    can't land on two payouts), `payouts/markArtistPayoutPaid`.
  - Teacher payouts (legacy #283), formerly `getTeacherPayouts`: `payouts/getTeacherPayouts`
    aggregates what Katie owes each teacher over a date range from paid private-pay invoice
    lines + rendered Hope Scholarship lessons.

### Public widget reads
- `publicSite` — **domain router** in `maple-core` (ADR-029) for the public reads the Webflow
  widgets make, every route public by design (allowlisted per route in
  `tools/check-callable-roles.ts`). **The one warm function**: `minInstances: 1` in prod, 0 in
  dev, `concurrency: 80`. Five of these reads used to keep an instance warm each, at about $8 a
  month apiece, which was nearly the whole Cloud Run bill; one router keeps one warm for all
  eight. Reads only: a public write belongs with its domain.
  - Classes (RegistrationWidget): `publicSite/getPublicClass`,
    `publicSite/getRequiredAgreementsForClass`, `publicSite/calculateRegistrationCost`,
    `publicSite/getRegistrationStatus`
  - Both checkouts: `publicSite/lookupDiscount`
  - Music Together widgets: `publicSite/getPublicMusicTogetherSection`,
    `publicSite/getPublicMusicTogetherSections`, `publicSite/getPublicMusicTogetherDemos`
- The widget calls these with `routeCallable` from `apps/webflow-components/src/firebase-init.ts`,
  so moving them needed a Webflow publish. The eight per-endpoint originals keep serving the
  old widget bundle until that publish, then are deleted by hand.

### Classes
- `getClasses`, `getClass`, `createClass`, `updateClass`, `deleteClass`, `uploadClassImage`, `uploadClassGalleryImage`
- `publicSite/getPublicClass` — see "Public widget reads" above
- `addToClassWaitlist` _(public; idempotent email signup stored under `classes/{id}/waitlist/{emailKey}`)_
- `getClassWaitlist` _(admin; returns a class's waitlist entries ordered earliest-signup-first plus a count; powers the portal roster's Waitlist section)_
- `getClassWaitlistCounts` _(admin; `classId -> count` map for every class via a `waitlist` collection-group scan, filtered to `classes` parents; powers the classes-list Waitlist column)_
- `notifyWaitlistOnSpotOpen` _(Firestore trigger on `registrations/{id}`; on active → inactive transition or delete, queues `class-spot-available` mail to every waitlist email then clears the subcollection)_
- `classCatalogFeed` _(public RSS 2.0 feed at `/catalog/classes.xml`; consumed by Meta Commerce Manager + Google Merchant Center; 15-min cache)_

### Music Together — cross-section interest list (legacy #602)
- `publicSite/getPublicMusicTogetherSections` _(public, on the `publicSite` router; customer-safe list of visible section options — id, name, first-session, location, derived status — drives the interest form's checkboxes)_
- `addMusicTogetherInterest` _(public; idempotent-per-email upsert to `musicTogetherInterest/{emailKey}` capturing `interestedSectionIds[]` + preference/alternate-time/notes; validates + verifies referenced sections before writing. Broader than the per-section `addToMusicTogetherWaitlist` — works even when nothing is full. Also persists Meta attribution and sends a server-side `Lead` — see "Top-of-funnel attribution" below)_
- `getMusicTogetherInterest` _(admin; returns all interest entries, a per-section demand tally (highest first), and a section-id→name map; powers the MT admin "Interest list" dialog)_

### Class Categories
- `getClassCategories`, `uploadCategoryGalleryImage`

### Discounts
- `discounts` — **domain router** (ADR-029, #62) for the staff side: `discounts/getDiscounts`,
  `discounts/createDiscount`, `discounts/updateDiscount`, `discounts/deleteDiscount`, each
  gated `[Admin, MtTeacher]` and narrowed per program inside the route.
  The four per-endpoint originals (`getDiscounts`, `createDiscount`, `updateDiscount`,
  `deleteDiscount`) are gone from the codebase. CI does not prune, so they are deleted from
  each project by hand (`firebase functions:delete`).
- `publicSite/lookupDiscount` — public, called by both checkout widgets; on the warm
  `publicSite` router (see "Public widget reads" above).

**Program scoping (legacy #791).** Every discount carries `program: 'classes' | 'music-together'` and is redeemable at **only** that checkout. The two programs settle to **different Square accounts owned by different businesses**, so an unscoped code let a Music Together promotion take money off a craft class and vice versa. Enforced in four places, all of which must agree:

| Where | Behavior on a wrong-program code |
|---|---|
| `lookupDiscount` (public) | returns `{ discount: undefined }` — byte-identical to an unknown code, so the unauthenticated endpoint can't be used to enumerate the other business's promotions |
| `calculateRegistrationCost` (preview) | no discount shown |
| `reserveClassRegistration` (authoritative) | **throws**, same branch/wording as an unknown code |
| `createMusicTogetherRegistration` | **throws**, likewise |

The preview and the authoritative path must stay in step: if the preview honored a code the charge path refuses, the customer sees a discounted price and is then rejected at submit.

Codes are **globally unique across programs** — a customer types a code without knowing which program owns it, so one string means one thing everywhere. `program` is **immutable** after creation (like `type`): repointing a live code would change what a customer holding it can buy, and on whose books.

**Legacy back-fill:** a document with no stored `program` reads as `classes`. That is a statement of fact, not a guess — MT had no discount support before legacy #791, so every pre-existing code was authored for class checkout. Defaulting the other way would silently expose Stephanie's account.

**Roles.** The four `discounts/*` routes are gated `[Admin, MtTeacher]` (they were admin-only) so Stephanie can run Music Together promotions from `/music-together/discounts`. The role gate alone would also hand her Maple & Spruce class pricing, so each route narrows it:

- reads — `discountProgramScopeForUser` **forces** a non-admin to `music-together` regardless of the requested `program`; the client's filter is never an authorization input
- create — `assertCanManageDiscountProgram` on the program being written
- update / delete — the same check on the **stored** program, the one whose money is at stake

`lookupDiscount` is public and called by **both** checkout widgets, each passing its own `program` (an omitted program defaults to `classes`, so a widget bundle deployed before scoping keeps working). A discount with `appliesTo: 'nth-slot-onward'` is additionally **rejected** by the MT path (`mtApplyDiscount` throws) and hidden from the MT admin form — MT prices a family, not slots, and additional children already get the sibling discount (legacy #599).

### Music Together — comped installments (legacy #791)
- `waiveMusicTogetherInstallment` _(admin + mt-teacher; flips one `musicTogetherScheduledCharges` doc `scheduled → waived` inside a transaction, recording `waivedReason` + `waivedByUid`. The family stays enrolled and every other charge stands — only this one is never taken._

  `waived` is a **new terminal status, deliberately distinct from `cancelled`**: both stop `chargeMusicTogetherInstallments` (which queries `status == 'scheduled'`), but `cancelled` is written by `cancelMusicTogetherRegistration` and means the family left. Collapsing them would make a comped installment unreadable on the roster.

  Refuses a charge that is already `charging`/`paid`/`failed`/`cancelled`, and refuses any charge on a cancelled or refunded registration — money has moved or the family is gone, and the fix there is a refund, not a status rewrite. Lives in `maple-core`, not `maple-square`: waiving takes no payment and needs no MT Square credentials._

### Registrations (read/update)
- `getRegistrations`, `getRegistration`, `updateRegistration` (the public price preview,
  `calculateRegistrationCost`, is on `publicSite`)
- `sendClassReminders` _(scheduled — daily at 8:00 AM ET; queues a day-of reminder email per paid registration whose class has a session today; idempotent via `reminderSentForSessions[sessionIso]`)_

### Calendar Events
- `calendar` — **domain router** in `maple-core` (ADR-029, #73) for the staff side of the calendar:
  events, the room schedule, and the embed configuration. Every route keeps its old gate.
- `calendar/getCalendarEvents`, `calendar/getCalendarEvent`, `calendar/createCalendarEvent`
  _(every staff role; a lesson teacher may only book a room)_, `calendar/updateCalendarEvent`,
  `calendar/deleteCalendarEvent` _(admin, MT teacher, clerk)_
- The public calendar URLs are **not** on the router and never move: `calendarEmbed` and the nine
  `.ics` feeds are raw HTTP handlers behind `/calendar/*` Hosting rewrites that families, Google
  Calendar and Webflow subscribe to.

### Calendar Triggers
- `onClassWrite` — Firestore trigger: auto-generates CalendarEvents from published classes
- `onLessonWrite` — Firestore trigger: auto-generates a private (`public: false`) Spruce Room CalendarEvent per scheduled lesson; removes it on cancel/delete
- `onMusicTogetherSectionWrite` — Firestore trigger: auto-generates a public `musictogether` CalendarEvent per session of a `visible` MT section; reconciles on edit and removes when the section is hidden or deleted

### Room Availability (#39)
- `calendar/getRoomSchedule` — every staff role: busy windows for a room over a time range (powers the dashboard "Spruce Room" widget and booking conflict checks)

### Calendar Embed Config
- `calendar/getCalendarEmbedConfig`, `calendar/updateCalendarEmbedConfig`, `calendar/addCalendarEmbedSource`, `calendar/removeCalendarEmbedSource` _(admin)_
- `calendarEmbed` — HTTP: `/calendar/embed`

### Sales (Phase 5)
- `recordSale` — manually record a product sale with automatic commission calculation, inventory movement, and quantity decrement
- `getSales` — retrieve sales with optional filters (artistId, source, date range)

### Agreements & Waivers
- `agreements` — **domain router** (ADR-029, #66), admin-only on every route:
  `agreements/getAgreementTemplates`, `getAgreementTemplate`, `createAgreementTemplate`,
  `updateAgreementTemplate`, `deleteAgreementTemplate` (archives), `getAgreementRequests`,
  `sendAgreementRequest`, `resendAgreementRequest`, `getSignedAgreements`, `getSignedAgreement`.
  Checked on dev on 2026-10-08. The ten per-endpoint originals are removed from the code;
  CI does not prune, so they are deleted from each project by hand.
- These stay off the `agreements` router on purpose (see the router's header comment):
  - `getAgreementForSigning` _(public, token-based; the `/sign/[token]` page)_
  - `submitSignedAgreement` _(public, token-based, 120s timeout; takes the signature upload)_
  - `publicSite/getRequiredAgreementsForClass` _(public — required-at-checkout templates for a
    class; called by the Webflow registration widget, which swallows its errors. On the warm
    `publicSite` router with the widget's other reads)_
  - `expireAgreementRequests` _(scheduled — marks expired requests; a schedule can't be a route)_

### Auth
- `getMyRoles` _(auth only, **deliberately its own function** — it gates every admin page on first paint, so it is kept off the `people` router. Returns every role the caller holds: admin from `admins/{uid}` + scoped roles from `userRoles/{uid}`; client nav gating. Also the caller's linked `instructorId`, if any (#157), so a teacher's pages default to their own students — a convenience, never a permission)_

> **Roles (epic #49, ADR-028):** "admin only" annotations below predate the scoped-roles matrix. Since PR 3, callables are gated by role sets: Music Together mgmt → admin + `mt-teacher`; store inventory/sales/categories + class registrations/rosters/waitlists/refunds + class reads → admin + `clerk`; lesson/student/invoice/instructor **reads** → admin + `lesson-teacher`; calendar events + room schedule → all staff roles. Everything else remains admin-only. The authoritative table is `apps/functions-integration-tests-utility/src/role-matrix.spec.ts`.

### User & role administration
Routes on the **`people` router** (ADR-029, #65), all admin-only. The ten per-endpoint
originals (these five and the five student functions) were removed from the code in #65 but
stay **deployed** until checked on dev and deleted by hand; CI does not prune.
- `people/listUsers` _(admin only — Firebase Auth users joined with admin records + scoped roles from `userRoles/{uid}`; powers `/users` page; capped at 1000 per call)_
- `people/grantAdminRole` _(admin only — promotes another user to admin)_
- `people/revokeAdminRole` _(admin only — demotes another admin; self-protection: cannot revoke your own admin)_
- `people/grantRole` _(admin only — grants a scoped role: `mt-teacher`, `clerk`, `lesson-teacher`; writes `userRoles/{uid}.roles`; rejects `admin`)_
- `people/revokeRole` _(admin only — revokes a scoped role; rejects `admin`)_

### Infrastructure
- `healthCheck` _(public liveness probe; also served at `/healthCheck` via a hosting rewrite)_
- `getSyncConflicts`, `getSyncConflictSummary`

### Top-of-funnel attribution (Music Together → Meta CAPI) (legacy #781)

No new functions — both events are sent **inline by the existing callable**, in
the same request. See `docs/guides/music-together-ad-tracking.md` for why (the
conversion *is* the request, the browser needs the `event_id` back in that
response, and a trigger would cost two Cloud Run services against the ADR-029
ratchet for no behavioral gain).

- `addMusicTogetherDemoRsvp` — now also sends a Meta CAPI **`Schedule`** to
  `META_PIXEL_ID_MUSIC_TOGETHER` for a NEW RSVP, with
  `event_id = mt-demo-<sha256(demoId:email)[0:16]>`. The id is returned in the
  response and reused verbatim as the browser Pixel's `eventID`, so the pair
  deduplicates. Hashed, **not** the doc id: RSVPs are keyed by the family's
  email, so `mt-demo-<docId>` would ship a plaintext address to Meta. This is
  the conversion the MT campaign optimizes against — paid enrollment is weeks
  later and in single digits.
- `addMusicTogetherInterest` — same shape, sending a **`Lead`** with
  `event_id = mt-interest-<sha256(email)[0:16]>`.
- Both persist `fbp` / `fbc` / `eventSourceUrl` / `clientIp` / `clientUserAgent`
  on the document (`clientIp`/`clientUserAgent` off the HTTP request, never the
  payload). Both send only on a NEW entry — the endpoints are public, so firing
  on every call would let a replay inflate a campaign's conversion count.
- Bounded at `MT_TOP_FUNNEL_CAPI_TIMEOUT_MS` (2s, vs the library's 5s default)
  because these block a form submit, and wrapped so a CAPI failure can never
  fail the RSVP or signup.

### Purchase attribution (class registration → Meta CAPI)
- `sendRegistrationConversion` — Firestore trigger on `registrations/{id}`. On the `pending → confirmed` transition (paid `source:'web'` only), sends a server-side Meta Conversions API `Purchase` with `event_id = confirmationNumber` for dedup against the inline browser Pixel. Recovers conversions the client Pixel drops (iOS/Safari ITP, ad blockers) and the ones it never fires at all (the Square-hosted checkout fallback, which redirects off-site). Best-effort: CAPI failures are logged and swallowed. Reuses the `META_CAPI_TOKEN` secret + `META_PIXEL_ID`/`META_CAPI_*` params from `tallyLeadWebhook` — no new secret. Shared client: `@maple/firebase/meta-capi` (`libs/firebase/meta-capi/`).
- `sendMusicTogetherConversion` — Firestore trigger on `musicTogetherRegistrations/{id}`. MT counterpart of `sendRegistrationConversion`: on the `pending → confirmed` transition of a paid MT registration, sends a Meta CAPI `Purchase` with `event_id = mt-<registrationId>`. **`value` is the family's FULL committed tuition** (sibling discount included), not the amount collected at registration — for an installment plan that is the sum of the whole plan, which carries a premium over paying in full. Installment 2 is charged around Week 5, far outside Meta's 7-day click window, so a follow-on event for it could never be attributed; reporting only installment 1 would just make installment families look half as valuable as pay-in-full families who commit the same total. **There is therefore no `Purchase` for installments 2..N — it would double-count.** `custom_data.amount_paid_today` carries the cash actually collected. Value source: `totalCommittedCents` on the registration. **Reports into the Music Together pixel (`META_PIXEL_ID_MUSIC_TOGETHER` = `1562555242035326`), NOT the Maple & Spruce `META_PIXEL_ID`** — MT advertises from its own Meta ad account (`act_1309930134551145`), and mixing the datasets would train the craft-class campaigns on MT enrollments and vice versa. Reuses the same `META_CAPI_TOKEN` secret — the Conversions API System User (`61573278578829`) already holds "Use events dataset" on both the MT and M&S datasets, so no new secret and no additional setup. The browser twin is `apps/webflow-components/src/lib/music-together-analytics.ts`; both sides must name the same pixel or the `mt-<registrationId>` dedup breaks and enrollments double-count. Best-effort: CAPI failures are logged and swallowed. Shared client: `@maple/firebase/meta-capi`.

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

### Product writes (Square catalog sync, #68)
- `productCatalog` — **domain router** in `maple-square` (ADR-029), every route gated
  `[Admin, Clerk]` like `products`, each holding the Square access token and strings (which
  every route already held as its own function, so nothing widened):
  `productCatalog/createProduct`, `productCatalog/updateProduct`,
  `productCatalog/uploadProductImage`. The three per-endpoint originals were removed from the
  code in #68 and are deleted from each project by hand.

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

### Lesson billing (#81, legacy #864)
- `runLessonBilling` _(scheduled — daily 09:00 ET)_ — **paused since #157 (`LESSON_AUTOPAY_PAUSED`)**: it fires and charges nothing, so no card is charged unless someone presses the button. `triggerLessonBilling` still runs the logic on demand. When enabled, it plans each eligible student's charges from their billing rule, then takes the ones that are due against the card on file. Daily rather than weekly because a charge anchored "the day before the first lesson" has to land on that day. Hope students are never touched (they bill through the EMA portal). Planning subtracts every lesson an existing charge already covers before blocking, so a prepaid block is not billed again and a cancelled first lesson cannot make a block re-form under a new id and charge twice.
- `lessonPayments` — **domain router** in `maple-square` (ADR-029, #67), admin-only on every route, each holding the Square access token and strings (which every route already held as its own function, so nothing widened). The four per-endpoint originals were removed from the code in #67 and are deleted from each project by hand.
- `lessonPayments/triggerLessonBilling` _(admin-only)_ — the callable twin: a manual catch-up, a dry run, and the only way integration tests can reach an `onSchedule`. Wraps `executeLessonBilling`, imported from the `run-lesson-billing` library. **Deliberately ignores `LESSON_AUTOPAY_PAUSED`**: it is the manual "run billing" override (ADR-034).
- `lessonPayments/chargeLessonsNow` _(admin-only)_ — takes money on the spot for a block of lessons a family is paying ahead for. Produces the same `LessonScheduledCharge` record the scheduled job would, already `paid`, so there is no second ledger. The atomic `create` at the charge's deterministic id **is** the lease, claimed before the payment, so a double click cannot take a second payment. Also retries a `failed` charge, reusing the original idempotency key so an attempt that did reach Square comes back as the same payment.
- `lessons/getLessonBilling` _(admin-only, `maple-core`)_ — rules, charges and the studio rate table in one read, so the screen prices a prepayment from the same numbers the server charges from.
- `lessonPayments/getSquareCardCandidates` / `lessonPayments/updateStudentSquareCard` _(admin-only)_ — find the card Katie already saved in the Square app and attach it to the right student. The read needs the Square SDK, which is why both live here.
- `createCraftClubSubscription` also emails a welcome on success.

`squareWebhook` additionally handles `subscription.created` / `subscription.updated` — reconciles the member's status (ACTIVE/PAUSED/CANCELED/DEACTIVATED) and paid-through date from Square; idempotent on no-change.

---

## Codebase: `maple-webhooks` (`apps/functions-webhooks/`)

Endpoints called by external SaaS platforms that enforce a short delivery
timeout. Deliberately the smallest bundle in the repo (~90kb) because a
codebase's cold start is set by its heaviest member — see ADR-031 before
adding anything here.

### Lead attribution (Tally → GA4 + Meta CAPI)
- `tallyLeadWebhook` — HTTP endpoint (Tally newsletter-signup webhook). Verifies `tally-signature` HMAC, extracts hidden fields, fans out to GA4 Measurement Protocol (`generate_lead`) and Meta Conversions API (`Lead`), each bounded at 4s. _(concurrency: 80, memory: 256MiB.)_ Manual setup: `docs/guides/tally-lead-webhook-setup.md`. Moved out of `maple-core` in 2026-08 — that bundle cold-starts in ~14.4s against Tally's 10s cutoff, and Tally does not retry.

---

## Codebase: `maple-sync` (`apps/functions-sync/`)

Webflow CMS synchronization. Isolates `webflow-api`.

- `syncArtistToWebflow` — Firestore trigger: syncs artist data to Webflow CMS
- `syncClassToWebflow` — Firestore trigger: syncs class data to Webflow CMS. Also links each class item to its category via the `category` Reference field, syncing the category on demand if it has no Webflow item yet.
- `syncClassCategoryToWebflow` — Firestore trigger: syncs `classCategories` to the Webflow Class Categories collection. That collection exists so classes can carry a `category` **Reference** field — Webflow can only filter a Collection List against the current item's field when that field is a reference, which is what renders related classes natively on the class template page instead of a callable (legacy #776).
- `syncMusicTogetherSectionToWebflow` — Firestore trigger: syncs Music Together section data to Webflow CMS (`visible` sections; enriches spots-remaining from live family count; sends the derived section status)
- `syncMusicTogetherSemesterToWebflow` — Firestore trigger: syncs Music Together semester (term) data to Webflow CMS (all statuses incl. `planned`; only removed on delete)
- `syncRegistrationCount` — Firestore trigger: re-syncs class to Webflow when registrations change (spots remaining)
- `syncMusicTogetherRegistrationCount` — Firestore trigger: re-syncs a Music Together section to Webflow when its registrations change (spots remaining, and the derived `open` → `full` status). The MT mirror of `syncRegistrationCount`: the section trigger above only fires on writes to the *section* document, so without this a family registering left the public card showing the count captured at the last admin edit.
- `expirePastClassPages` _(scheduled — daily 3:30 AM ET)_ — unpublishes the Webflow CMS item for any class whose last session has ended, so past `/classes/{slug}` detail pages drop out of the live site and the sitemap. Unpublishes rather than deletes (item keeps its ID + slug and republishes if rescheduled). No-ops in dev.

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
