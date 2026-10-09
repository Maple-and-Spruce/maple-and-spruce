# Session Context

> **DIRECTIVE**: Keep this file updated with current work status. Archive completed sessions to `history/YYYY-MM-DD.md`.

---

## Current Status

### Dependency refresh 2/5: Functions and CI on Node 24 (2026-10-08)

- All six codebases run on `nodejs24` (`firebase.json`). The esbuild `target` in each
  `apps/functions*/project.json` moved from `node20`, which had never been updated, to `node24`.
- CI runs on Node 24 everywhere. The two dev-Firestore seed jobs (`e2e_dev` and the job after it)
  were pinned to `22.22.3` because of the node-fetch@2 "Premature close" regression
  (nodejs/node#63989). They now ask for `^24.18.0`: the fix (nodejs/node#64004) shipped in
  22.23.1 and 24.18.0. The runner image currently caches 24.21.0.
- `@types/node` 22 → 24.19.1. Its old `RelativeIndexable` global had been quietly adding
  `Array.prototype.at` for the Functions apps, whose tsconfigs still said `es2020`. Without it, `nx
  build` failed (TS2550) while `nx typecheck` passed. The six `apps/functions*/tsconfig.json` now
  target and use the lib for `es2024`, which matches the runtime.
- The admin app's Vercel projects were already on Node 24.x (project setting). Only the CI
  `vercel build` step was still on 22.
- firebase-tools has supported `nodejs24` since 14.26. Every Functions dependency accepts 24
  (firebase-admin 14 needs ≥ 22).

### Dependency refresh 1/5: patches, fresh lockfile (2026-10-08)

The first of five dependency PRs. The rest: Functions on Node 24, vitest 5, firebase JS SDK 13,
Next 16.4. TypeScript 7 waits: typescript-eslint and the Nx TypeScript plugin still need the
compiler API, which 7.0 doesn't ship.

- **next 16.3.7 → 16.3.8** clears a high advisory (GHSA-cjq9-62q9-8jv4) that failed the audit
  gate. `apps/maple-spruce/package.json` carries its own `next` pin (Vercel installs from it), so
  bump both, or `pnpm audit` keeps reporting the old one.
- nx/@nx 23.3.0. The only migrations in 23.3 are the Cypress 16 set (not used) and the
  optional vitest 5 bundle, which was declined. vitest 5 gets its own PR.
- nx 23.3 stopped pinning vulnerable smol-toml, axios and brace-expansion, so those three
  overrides are gone.
- **`@firebase/app` is pinned exactly to what `firebase` pins (0.16.2).** The root dep exists
  only as the Functions peer-dep shim. On a fresh lockfile its caret range drifted to 0.16.3,
  the web bundle loaded two copies, and every `getFunctions()` threw "Service functions is not
  available". Unit tests, typecheck and build all stayed green; only the Storybook play tests
  (18 failures) caught it. Bump the two together. The reason is next to the shim in
  `global-runtime-options.ts`.
- Patch and minor bumps: MUI X 9.15, Playwright 1.64, @webflow/* 2.6, webflow-cli 2.11,
  firebase-tools 15.33, vite 8.3.4, typescript-eslint 8.71.1, swc 1.16.13. `@swc/cli` was removed
  because nothing used it.
- The `npx firebase-tools@latest` deploy steps now use the `FIREBASE_TOOLS_VERSION` workflow env
  var (15.33.0). Keep it in step with package.json.
- Not removed: `@babel/*` (the `.babelrc` files in `libs/react/*` name `@nx/react/babel`, and
  it is in the tree transitively anyway; babel 8 is a separate question) and `nyc` (CI merges coverage with it). `nyc` is why `sprintf-js` shows a moderate
  advisory with no fix.

### Hope prices come only from EMA products (2026-10-08, #83 part 3)

The hardcoded length table (`HOPE_PER_LESSON_RATE_CENTS` / `HOPE_MONTHLY_EQUIVALENT_CENTS`)
is gone. `resolveHopeLessonRate(student, productsById)` returns the product price or
`{ source: 'unpriced' }`; nothing in code stands in. A Hope student on no product (or a
product id that no longer resolves):
- **Hope queue**: entry has no `rateCents`, `rateSource: 'unpriced'`; counted in the lesson
  counts but in no cents total; `totals.unpricedCount` drives a warning on the Hope Billing page
  and in `HopeStudentBilling`. Ready-to-invoice lessons are still priced from their order.
- **recordHopeSubmissions**: rate is order price ?? existing claim rate ?? product price; if none,
  the lesson is skipped ("Put the student on an EMA product first"), never stamped.
- **Teacher payouts**: the line is listed with `baseRevenueCents` undefined and counted in
  `unpricedHopeLessonCount`. Flat and hourly teachers are still paid for it (their pay never
  depended on the price); a percentage teacher's share stays undefined, out of `totalOwedCents`,
  and is counted in `unpricedHopePayPendingCount`. `TeacherPayoutsList` shows "N Hope lessons
  unpriced", "Needs EMA product", and a warning worded for whether pay is held.
  `missingRateConfig` now comes from the teacher, not the lines.
- **HopeScholarshipBanner**: warning, no dollar figure. `registeredLessonLength` prop removed.
- `formatCents` moved to `libs/react/lessons/src/lib/format-cents.ts`.


### Lessons the way Katie runs them (2026-10-04 – 10-05, epic #156, ADR-034)

Katie has about five minutes at the end of a lesson, one in four, to book the next four lessons
and take payment. The lessons UI was built for a different model (generated lessons, mark taught,
automatic charging), so it was reworked in six slices:

| Slice | PR | What |
|---|---|---|
| #157 | #164 | Booked on demand: weekly time books nothing; past-and-not-deleted = happened; auto-booking and auto-charge are logged no-ops; `getMyRoles` returns `instructorId`; prod cleanup removed 39 unpaid generated lessons |
| #158 | #169 | Student page tabs: **Next lessons** (one button books + charges, or invoices without a card), **Settings**, **Activity** (paid labelled, unpaid past not called out) |
| #159 | #171 | Students list by weekday from weekly times, mine first |
| #160 | #173 | My Week names each own lesson and opens Next lessons; Today drops Mark taught / No-show |
| #161 | #174 | Instruments are a setting (violin, fiddle, guitar, harp) on a new `settings` router |
| #162 | this | Lesson Billing hidden from the nav; ADR-034 |

**Gotchas worth keeping.**
- A component barrel imported by a unit-tested module drops merged coverage ~8 points (#169): keep
  pure logic in `@maple/ts/domain`, not in a component library.
- CI lints with `eslint .` across the repo; a per-project nx lint run can skip a library (#174).
- Removing a scheduled function does not stop it: CI never prunes. Make it a no-op first.
- Unpaid past lessons exist in prod (25 private-pay, 2 Hope at the time) and are deliberately not
  surfaced — past payments were settled outside the portal.

**Follow-ups:** move the six singleton config functions onto the `settings` router (net −5), then
delete the old ones by hand; retire the no-op materializer and auto-charge schedules by hand once
the studio is sure it won't want them back.

### Class-instructor payouts: monthly statements, marked paid by hand (2026-09-29, PRs #141 → #142 → this)

Contract instructors now get a **monthly statement** at `/payouts?tab=classes`. The policy is David's (2026-09-28/29):
- The instructor gets 80% (`Instructor.payRate`, percentage) of what the student paid for the class, after discount and before tax.
- M&S absorbs the card fee.
- Revenue is split evenly by session, and each session is paid in the month it was held.
- `confirmed`, `no-show` and unrefunded `cancelled` registrations count.
- A refund after a statement is paid comes off the next statement.

The app never moves money. David pays in Square Payroll or Bill Pay and records the date, method and reference.

**The double-pay guard is a ledger** (ADR-035). `payoutLedgerEntries` gives every payable unit a deterministic id (`class-session_{reg}_{i}`, `class-refund_{reg}`), and generate writes the statement and its entries in one transaction that refuses when any entry already exists. Void (pending only) releases them. The artist-payout path got the same guarantee in #145 (see below).

**Three things found on the way.**
- `getNetAmountPaid` took the discount off twice and left the sales tax in. It now returns `subtotalCents`.
- Refunds were recorded with no time or amount; the Square refund id was thrown away. `cancelRegistration` now writes `refundedAt`, `refundedAmountCents` and `squareRefundId`.
- **Refunds made in the Square dashboard never reach the app.** This is not fixed: `squareWebhook` would need a refund handler.

**Gotcha: `next dev` writes `apps/maple-spruce/AGENTS.md` + `CLAUDE.md`** (Next's agent rules) and rewrites `next-env.d.ts` to `.next/dev/types`. Delete and restore them before committing, or set `agentRules: false` in `next.config`.

**Next:** give lesson teachers the same ledger (#58).

**Follow-up landed (#145): the four older payout functions are routes on `payouts` now.** `getPayouts` / `generatePayout` / `markPayoutPaid` became `payouts/getArtistPayouts` / `generateArtistPayout` / `markArtistPayoutPaid` (renamed, since "payouts" alone is ambiguous on a router that also serves instructor statements), and `getTeacherPayouts` kept its name. Function count 240 → 236. `generateArtistPayout` now writes the payout and stamps its sales in one transaction (`PayoutRepository.generate`); before, it stamped them one by one after creating the payout, so two concurrent generates could both pay the same sales. **The four old functions are still deployed** in dev and prod, because CI does not prune: delete them by hand once the router routes are verified in dev (`firebase functions:delete getPayouts generatePayout markPayoutPaid getTeacherPayouts`, dev first).
### pnpm 11 → 12 (2026-10-05)

- `packageManager` → pnpm 12.9.1. pnpm 12 rejects unknown workspace settings;
  `managePackageManagerVersions` no longer exists and was removed. Its job
  (keep the lockfile single-document for Nx) is moot: pnpm 12 always writes a
  multi-document lockfile and Nx 23.2 parses it (pruned deploy lockfile came
  out byte-identical). Closes #29.
- pnpm 12 is a native binary, so its installers need upgrading too:
  `pnpm/action-setup` v4 → **v6.1.0** in all 27 places (the floating `v6` tag
  lags behind 6.1.0, so it is pinned), and the Vercel jobs install
  `corepack@latest` because vercel.json's installCommand runs
  `corepack enable && pnpm install` and only corepack ≥ 0.35 can run pnpm 12.
- Firebase function deploys are unaffected: Cloud Build installs them with npm
  (CI deletes the deploy lockfile; buildpacks only choose pnpm when one exists).
- Audit wrapper still passes clean and still fails on an un-ignored high.
### Webflow code components 1 → 2 (2026-10-05)

`@webflow/react` 1.x only supported React up to 19.0.0, and the refresh moved
the app to React 19.3, so the widgets were outside their supported range.
2.x supports all of React 19 and fixes a React 19 prerender race.

- `@webflow/react`, `data-types`, `emotion-utils` 1.3 → 2.5; `webflow-cli`
  1.23 → 2.10 (needs Node ≥ 22.13; CI's `node-version: '22'` resolves above it).
  Our widgets only use `declareComponent`, `props` and the emotion decorator,
  none of which changed.
- Merge-time publish: `webflow library share` → `webflow devlink import`
  (same implementation in the CLI; `library` is deprecated, gone in CLI 3).
- PR CI now runs `webflow devlink bundle` after the typecheck (~20s). The old
  comment said bundling was broken upstream; it works with both 1.x and 2.x.
- Overrides: `koa` and `ws` removed (CLI 2.x no longer pins vulnerable ones);
  `undici` added (dts-plugin pins 7.24.7). `adm-zip`, `form-data` stay.
- Same 8 components, same React 19.3; client bundle ~170KB smaller.
- After merge: publish the Webflow **site** (not just the library) and check
  the widgets on staging, or the old widget JS keeps serving.

### MUI 7 → 9, MUI X 7 → 9 (2026-10-04)

Last of the deferred majors from the dependency refresh. Codemods did the bulk
(slots/slotProps, system props → sx, picker adapter/day renames). The rest:

- **Silent colour loss:** Typography `color` only matches names in v9, so all
  295 `color="text.secondary"`-style props and 5 computed ones became
  `textSecondary` / `error` etc. ESLint `no-restricted-syntax` now errors on any
  dotted path in a JSX `color` prop.
- **material-react-table** (sticky columns in billing/lessons/students) passes
  props MUI 9 ignores. `patches/material-react-table@3.2.1.patch` renames them;
  tracked in #166 (MRT looks unmaintained).
- **Data grid:** MUI X 8+ paints grids white and reads header colour from a new
  variable that a later `<style>` rule overrides; theme `palette.DataGrid.bg`
  plus `&.MuiDataGrid-root` header variable restore the old look exactly.
- **Date fields** are `MuiPickersOutlinedInput` now; theme styles it like inputs.
- **Etsy import selection** resolves the grid's new include/exclude model to ids.
- Verified by pixel-diffing all 678 stories against main: 638 identical; the
  rest are MUI X's own row/skeleton layout and anti-aliasing. Date-time/time
  pickers behave as before (OK to confirm) plus a Cancel button.

### vest 5 → 6 (2026-10-04)

Vest 6 removed `staticSuite` and points to `create(cb).runStatic(...)`, but
`runStatic` is not isolated: a focused run (`only(fields)`) reports stale errors
for unfocused fields from the previous call. That would break the functions'
partial-update validation and leak one request's errors into the next in a warm
container. Five existing partial-update specs caught it.

- `libs/ts/validation/src/lib/static-suite.ts`: local `staticSuite` that builds
  a fresh suite per call (`create(cb).run(...)`), the Vest 5 behaviour. The 34
  suites only change their import line; no caller changes.
  `static-suite.spec.ts` pins isolation (verified to fail on `runStatic`).
- `enforce(x).inside(list)` now types `list` as a mutable array: six `as const`
  lists are spread (`[...LIST]`). Type-only.
- Docs: PATTERNS-AND-PRACTICES Vest section and the functions rule now say to
  use the local helper, never Vest's `create` / `runStatic`.
- `require('vest')` ~3ms → ~6ms; negligible for maple-webhooks' cold start.
- Next deferred major: MUI 9.

### Square SDK 45 → 46 (2026-10-04)

SDK 46 moves the default `Square-Version` from 2026-08-19 to 2026-09-16. That
API version's only change is retiring the Transactions API write endpoints
(Charge, CreateRefund, CaptureTransaction, VoidTransaction), which nothing here
calls; all payments go through the Payments/Orders APIs. No type changes across
any lib (same 334 pre-existing `tsc` errors as main). First of the deferred
majors from the dependency refresh; next are vest 6, then MUI 9.

### Dependency refresh: 50 overrides down to 9 (2026-09-29, refreshed 2026-10-04)

Security Audit was failing on main (6 high). A fresh resolve (no lockfile, no
overrides) showed almost every override was covering a *stale lockfile* entry,
not a missing upstream fix.

- Minor bumps across the board: nx 23.2.1 (+ its migrations), Next 16.3.7,
  React 19.3, Storybook 10.6.1, Firebase 12.19 / admin 14.5 / functions 7.4,
  firebase-tools 15.32, vite 8.3, vitest 4.1.11, Playwright 1.63.
- Majors: ESLint 10 (+ @eslint/js 10), jsdom 30, jscpd 5,
  jsonc-eslint-parser 3, @vitejs/plugin-react 6, date-fns 4, ical-generator 11.
- Removed unused deps: @tanstack/react-query, wait-on (it pulled the flagged
  joi), concurrently, node-ical, http-server, ts-node, @vitest/ui.
- Overrides: ~50 down to 9, each pinned by a named parent: adm-zip/koa/ws/
  form-data (@webflow/webflow-cli), smol-toml/axios/brace-expansion 5.x (nx),
  @grpc/grpc-js (@firebase/firestore ~1.9), basic-ftp (firebase-tools >
  get-uri ^5). The last four came from advisories published 2026-09-30 to
  10-01, after the first pass.
- `auditConfig.ignoreGhsas`: image-size is gone from the tree; one new entry,
  braces GHSA-vfj7-8cjw-p6xm, which has no patched release and is in no
  production dependency tree. Audit: 52 findings → 4 (only high is the
  ignored braces).
- Storybook on Vite 8 resolves `@maple/*` through Vite's native tsconfig paths,
  which skips files outside a tsconfig `include` (every story). `.storybook/main.ts`
  now adds vite-tsconfig-paths on tsconfig.base.json, as the unit config does.
- New ESLint 10 / sonarjs 4.2 rules set to warn (~80 pre-existing hits).
- Deferred, each its own PR: Square SDK 46, MUI 9 + MUI X 9, vest 6,
  @webflow/* 2.x (payments / UI / live registration widget). Blocked upstream:
  TypeScript 7 and vitest 5 (nx + typescript-eslint), Babel 8 (nx).

### Recording history: past lessons paid outside the app (2026-09-29)

Katie had paid private-pay history (cash, Venmo, cards run in Square by hand)
with no way to record it: "Paid in cash or Venmo" only appeared once the
past-lessons card listed something, and it listed only lessons marked taught.

- "Charge for past lessons" now also offers past lessons still `scheduled`
  ("Past, not marked taught"), uncapped; ticking and acting marks them taught
  first (`onMarkTaught`), then charges, invoices or records the payment.
- **Already paid (cash, Venmo, Square)**: new `square-manual` source ("Card, in
  Square": a payment already taken in Square, nothing charged). Total is
  prefilled from the rate and editable; `splitCentsEvenly` spreads it across
  the lesson lines. Also on the billing table's mark-paid menu.

### Hope billing: EMA orders and invoicing (2026-09-29)

Katie's Hope work: record the family's EMA order (a block of lessons), mark
lessons taught, invoice them in the portal, tick them off. "Invoice completed"
is the end state (EMA payment is not tracked).

- `HopeOrder` (`hopeOrders`): product, price copied at order time, lesson count,
  EMA order id, ordered-on. `allocateHopeLessons` draws taught lessons down
  oldest order first: each is needs-order / ready-to-invoice / invoiced.
  Pre-order claims stay invoiced and use no order's room.
- Invoicing (`recordHopeSubmissions` status `submitted`) refuses a lesson no
  order has room for and stamps `orderId` + the order's price on the claim.
- `HopeStudentBilling` card: orders with room left, needs-order warning, ready
  lessons with tick-all + "Mark N invoiced" + optional EMA invoice #, invoiced
  folded away. On the student page (for Hope, in the past-lessons slot) and once
  per student on the Hope Billing page, which replaced the flat `HopeQueue`.
- Follow-up: the Needs Attention "Hope lessons not yet claimed" row does not
  distinguish needs-order from ready yet.

### Hope lessons priced from EMA products (2026-09-29)

Hope rates were a hardcoded length table (`hope-rates.ts`): a 30-minute guitar
lesson showed $41.25 while EMA pays $30, and teacher payouts inherited it. The
website, the EMA products and the table also disagree with each other (see PR).

- `HopeProduct` (EMA id, name, price, active) in `hopeProducts`, managed on the
  Hope Billing page ("EMA products"); `Student.hopeProductId` set in the form.
- `resolveHopeLessonRate(student, lesson, productsById)` is the one rate
  definition: product price, else the old table as an `estimate` (flagged in the
  queue and the banner). (Superseded 2026-10-08: the table is gone and the
  fallback is `unpriced`.) Replaces three copies of the length fallback in
  getHopeQueue, recordHopeSubmissions and teacher payouts.
- New `hope` router (function count 239 → 240); the old rates table component
  is gone; the Hope banner is compact with rules folded away.
- Next (PR 2): EMA orders (one order covers several lessons, drawn down oldest
  first), per-lesson needs-order / ready-to-invoice / invoiced, and a Hope card
  on the student page. "Invoice completed" is the end state.

### "The next 4" fills itself in (2026-09-29)

A student with two lessons made by hand and no weekly time: "the next 4"
quietly covered two, and getting to four meant the full scheduling form.

- `fillWeeklyLessonDates(like, existing, needed)` (domain, tested across the
  DST change): the missing weeks, weekly from the first upcoming lesson at its
  weekday and time, skipping weeks that already have a lesson.
- "Next lessons" shows "Only 2 of the next 4 lessons are on the calendar. Add
  <dates>, same teacher and length?" with **Add 2 lessons** / **Other dates**.
  It calls `createLessonSeries` with those dates.
- Every lesson needs a block and hand-made ones often have none, so
  `planFillBlock` uses a fitting recurring block, else derives a new one and
  the notice says so; widening a block is never done from here.
- "This covers" now lists the dates even when there is no rate to charge.

### Paid in cash or Venmo, and what "Mark taught" does (2026-09-29)

Katie asked whether "Mark taught" invoices or charges (it does neither; it
only records the lesson) and for a simple way to record a cash payment.

- `createInvoice` takes `paidWith` (`admin-manual` = cash/check, or
  `venmo-manual`) with `status: 'paid'`: the invoice is created already paid,
  stamped with who recorded it. It never reaches Square (sync only acts on
  sent/void), so no bill is emailed. On that path the server refuses lessons
  already covered by a charge or a live invoice.
- "Paid in cash or Venmo" sits beside Charge / Send invoice on both lesson
  cards (and the table dialogs); the confirm names every date and asks how.
- "Mark taught" has a tooltip saying it never charges or invoices; the notice
  after marking one adds a "Paid in cash" action next to "Send invoice".
- Auto-charging is separate and unchanged: the nightly job charges active,
  non-Hope students on a billing rule with a linked card, in blocks ahead.

### Four lessons ahead, and a way in for students with no weekly time (2026-09-29)

Katie's feedback: saving a weekly slot put 12 lessons on the calendar and she
works four at a time; and a student with no weekly time got a warning and two
disabled buttons in "Next lessons".

- `SCHEDULE_LESSONS_AHEAD = 4`: each active arrangement is topped up to four
  upcoming lessons of its own (cancelled ones do not count, so a skipped week
  pulls the next date in). Nothing is deleted; students already holding twelve
  keep them until they run down. Fortnightly students get four too.
- `materializeLessonSchedules` now runs **daily** (was weekly), so a weekly
  student is back to four the morning after a lesson.
- Creating an arrangement fills only that arrangement (it used to top up every
  student's and report their lessons as this one's).
- "Next lessons" with nothing upcoming offers **Set a weekly time** / **Add
  lessons one at a time**. The student-page card is "Weekly schedule".

### Lesson rates per teacher, per instrument (2026-09-29)

Base lesson prices were one studio-wide table by length, buried in Settings,
and empty in prod, so every student without an override priced at $0. Rates
now live on the teacher: `Instructor.lessonRates` is instrument → length →
cents, edited in the Instructors form ("Lesson rates").

- Price order: the student's own `lessonRateCents` → their **primary
  teacher's** rate for their instrument and length → the studio default
  (Settings) → nothing. Primary teacher, not whoever taught, so a substitute
  week costs the family the same.
- `effectiveRateByLength(student, teacher, studioRates)` builds the table;
  `resolvePrivatePayLessonRateCents` is unchanged and takes it.
- `getLessonBilling({ studentId })` returns that student's effective table, so
  every screen that prices a student (student page, billing cards, launchers)
  picked this up with no client change. `chargeLessonsNow` and the nightly
  `runLessonBilling` price from the same table.

### Student management follows Katie's task order (2026-09-29)

Katie's jobs with a music student, most to least common: add them, edit rate /
instrument / teacher, set the weekly slot, charge for past lessons, line up the
next lessons (paying ahead optional). Card links and the lesson/billing history
are occasional. Both screens now follow that order.

- **Student page**: header with rate in the summary and an **Edit student**
  button (was table-only) → Standing schedule → **Charge for past lessons** →
  **Next lessons** (with "Add lessons") → *History and settings*: Lessons,
  Billing, Payment method.
- `CommitLessonsCard` takes `scope` (`owed` / `upcoming` / `all`), `embedded`,
  `isLoading` and `headerAction`, so one card became the two task cards without
  a second pricing path. A pre-tick outside the scope is never charged.
- **Students table**: visible edit button per row; the ⋯ menu is in task order
  and adds Weekly schedule…, Charge for past lessons…, Next lessons…, each a
  dialog (`students/student-launchers.tsx`), sharing components with the page.

### ADR-029's first router, and the function count finally telling the truth (2026-09-23 → 09-29)

**Artists is the pilot** (#126, #127). ADR-029 was accepted in August and nothing had been
built on it. The primitive turned out to be mostly extraction rather than new code: `handle()`
already did CORS, auth, the role gate, validation, uniqueness, warmup and the `{ data: … }`
envelope inline, so that body became `runRequestPipeline(route, req, res)` and `handle()` now
calls it with a single route. A router therefore runs the *same* middleware per route rather
than a second implementation of it, which is what the ADR predicted.

Two things a router loses unless they are put back deliberately, and both cost a real outage
if forgotten:

- **Per-route observability.** The function name is the domain now, so a log line cannot say
  which endpoint wrote it. The router logs `[artists] getArtist`, and a 404 names the route
  asked for *and* the routes that exist.
- **A checkable role gate.** `check-callable-roles.ts` reads the AST, so it now classifies each
  route and reports per route. That forces the gate to be written out literally on every route:
  a `const admin = () => Functions.endpoint.requiringRole(...)` helper is invisible to the
  analyzer, every route reads as *public*, and the tempting fix is an allowlist entry that would
  then permit a genuinely ungated route. Written down in `.claude/rules/firebase-functions.md`
  so the next router does not rediscover it.

**Then the count was made honest.** #127 deleted the five old artist libraries, and the five
deployed functions were removed by hand in dev and prod (CI does not prune). While counting,
prod turned out to carry **9 further orphans** and dev **13**: eight from the custom timesheet
retired for Square Shifts + Payroll (legacy #412), `getRelatedPublicClasses` replaced by native
Webflow CMS rendering (legacy #777), and in dev also `getPublicArtists` / `getPublicClasses`
plus two functions from an unmerged branch (see below). All pruned after checking each for
repo references and 30 days of invocation logs, with the log query validated against functions
known to have been called.

Both projects now reconcile **exactly**: 239 repo functions + 1 Firebase Extension = 240
deployed, nothing dangling in either direction. That is the first time the baseline and reality
have agreed, which also makes #89 (the guard counts libraries, not deployments) measurable
rather than theoretical.

**Gotchas worth keeping.**
- A bare call to a router legitimately 404s from our own code (`Unknown route ""`). A probe
  that reads status alone will report a live router as missing; read the body.
- #126 shipped without adding its library to `apps/functions/tsconfig.app.json`.
  `validate-function-tsconfigs.sh` catches it, but **nothing in CI runs that script**, so it
  merged.
- A 7-assertion spec for one pure function dropped merged coverage 83.7% → 76.7%, by importing
  `functions.utility` unmocked and pulling the whole `@maple/firebase/database` layer into the
  denominator: 101 files at ~6%. The sibling spec had imported that module for months without
  consequence because it mocks its dependencies. Now documented in
  `docs/reference/code-standards.md`, along with the habit that found it — measure `origin/main`
  with the same command before concluding anything from one number.
- `role-matrix.spec.ts` names ~30 callables from every domain, so any function rename or
  deletion touches it. It declared **2** implicit dependencies, so nx does not mark it affected;
  it broke on this work and only surfaced because an unrelated `tsconfig.base.json` edit dragged
  the suite in.

### Charging for teaching already given (#128, #129)

Katie could always *invoice* a past unpaid lesson, but not take it from the card on file: the
charge path filtered to `scheduledAt >= startOfDay(now)`, with a comment that a past lesson is
"a conversation about a debt". That is a fair description of paying **ahead**, and not a reason
the studio should have no way to collect for teaching it has already given.

`unpaidTaughtLessons` is the other half of chargeable, disjoint from `prepayableLessons` and
sharing its midnight boundary so a lesson taught earlier today appears in exactly one of the
two. It requires `didConsumeSlot` rather than merely being past-dated: a lesson still marked
`scheduled` last Tuesday has not been taught as far as this system knows, and charging for it
would invent the fact that it happened.

**Only an explicit tick reaches a past lesson.** `planPrepayment` widens its pool for
`lessonIds` and leaves the `lessonCount` shortcut upcoming-only, so "charge the next four" can
never quietly collect a debt nobody ticked. No date cutoff, by decision: a year-old unpaid
lesson is still owed and the judgement belongs to Katie rather than a constant.

Two ways in, one charge path: an "Already taught, not paid for" section in the picker, and the
attention row now carrying the lesson so it lands pre-ticked. That link crosses a library
boundary, so the query parameter is a shared constant with a `studentChargeHref` builder —
two spellings of `chargeLesson` would fail no build, typecheck or test, and the link would
simply arrive with nothing ticked.

Left alone deliberately: a **waived** charge still suppresses a past lesson, because
billed-ness is decided exactly as the forward path decides it. That is #115, it predates this,
and making past lessons behave differently would hide it rather than fix it.

### Deploy fan-out (#122, #123, #124, #125)

Roughly half of all PRs were redeploying every function. Two config causes were fixed and
verified on main: `projectsAffectedByDependencyUpdates: "auto"` took a lock-file change from
315 affected projects to 1, and removing the `.env.dev` `namedInput` took 240 to 1 (any
`{workspaceRoot}` glob in a named input marks every project affected — nrwl/nx#11922).

#125 then cleaned up after #124, which removed the `functionsEnv` named input but left one
reference in `libs/firebase/functions/project.json`. Worth knowing the shape: nx tolerates a
dangling named input when the project is targeted **directly** and errors when a *dependent*
resolves `^default`. No CI job hit it, because the ESLint job shells out to `eslint .` rather
than going through nx — it only broke nx-mediated lint run locally.

Still open from #122: slicing the four domain libs, worth about 112 PRs (20%).

### Going public again: rewritten history + PII safeguards (2026-09-16)

The repo went private after customer data leaked into tests and docs. legacy #857 scrubbed the
files, but the data was still in older commits and in PR refs and edit history that only
GitHub support can purge. `main` was rewritten with `git filter-repo` and pushed to a new
private repo, `maple-and-spruce-clean`, to become the public `maple-and-spruce`. The
rewrite was verified against a prod-built roster: no roster names, emails or phones
anywhere in history. See `docs/guides/public-repo-migration.md` for what was done and the
remaining manual steps (secrets, repo rename, Vercel/Chromatic, issues, flip to public).

The safeguards PR adds four layers (see `.claude/rules/customer-privacy.md` → Enforcement):
- git pre-commit, commit-msg and pre-push hooks, turned on by `pnpm install`
- a Claude review of the pushed lines on pre-push (`tools/pii-claude-review.sh`)
- a Claude Code PreToolUse hook guarding commits, pushes, PR/issue text and GitHub MCP
  writes (`tools/claude-pii-guard.sh`)
- names checked in CI from a `CUSTOMER_NAMES` secret

Names now match on letter boundaries, so `cus_<name>` and `<name><Surname>` (the shapes
that actually leaked) are caught. The checker never prints a matched name.

**Gotchas.**
- `claude -p` from a hook needs `--strict-mcp-config --disable-slash-commands
  --setting-sources "" --tools ""`. A fully loaded profile was ~234k tokens, over the
  context limit before the prompt was even read.
- legacy #857 missed real card last-4s and two first names inside `cus_` ids. A full-name-only
  scrub can't see those.

### One class, two CMS items: a race in the class → Webflow sync (2026-09-16, legacy PR #879)

`/upcoming-classes` was rendering **12 cards for 8 classes**. Four pairs were the same class
twice, disagreeing about availability — the Oct 7 Stained Glass class was **full** while its twin
advertised 8 free places, so the site was selling seats that did not exist.

**It was a race, not duplicate data.** Every duplicated pair shares one `firebase-id`, and the
twins were created **35ms–974ms apart**. `ClassService.syncClass` decided create-vs-update with an
unguarded read-then-write, and Webflow enforces no uniqueness on `firebase-id`, so two invocations
that interleaved between the read and the write both created. The loser of the `webflowItemId`
write-back was then orphaned: nothing in Firestore pointed at it, so no later sync updated it and
its `spots-remaining` froze at creation time. That frozen "8 spots" is the signature — every
doomed item showed full capacity while its keeper tracked reality.

**The concurrency source was a missing guard, not user behaviour.** `syncClassToSquare` has
`SQUARE_RELEVANT_FIELDS` and skips writes that change nothing material. `syncClassToWebflow` had no
equivalent, so `syncClassToSquare`'s own `updateSquareSyncIds` write-back re-fired it *while the
first invocation was still in flight and had not yet stored `webflowItemId`*. Both saw `undefined`,
both created. One admin save, two cards.

**Five neighbouring defects came out of the same investigation**, all now fixed with tests:
transient Webflow errors were laundered into "not found" and routed to `createItem`;
`syncRegistrationCount` called `syncClass` and threw the returned `webflowItemId` away, so anything
it created was born orphaned; `deleteClass` hard-deleted with no cascade, orphaning registrations;
and `ClassForm` had no synchronous double-submit guard — the legacy #286 signal fix was never ported, so
two fast clicks meant two class documents.

**Three things worth remembering.**

- **The Webflow SDK retries 5xx internally.** A single injected 500 never reaches our code; the
  retry absorbs it. So bug B's real shape is a *sustained* failure or a 429, not a one-off blip —
  and any test that injects a transient failure must arm several to outlast the retries, then
  disarm before verifying or the leftovers answer the test's own checks.
- **The mock could only succeed or 404, which is why the bug was invisible.** The existing spec
  rejects `getItem` with a bare `Error` and asserts a create, so it passes identically for a 500 as
  for a deleted item — it encoded the bug as correct. `failNextWebflowLookups` /
  `clearWebflowLookupFailures` now exist, mirroring `declineNextPayment` in the Square mock. Same
  lesson as the Tally `label` case: a mock that cannot lie the way the real service lies will agree
  with whatever the code already assumes.
- **The cross-instance race is NOT closed** — see ADR-033. The in-process mutex serialises same
  instance syncs and the reconciliation converges duplicates after the fact, but two Cloud Run
  instances still have no shared lock. Deliberate; do not "fix" it with a Firestore lease without
  reading the ADR first.

**Production cleanup, already run.** `tools/dedupe-class-cms-items.ts` keeps the item Firestore
points at, backs every removal up to JSON first, and verifies afterwards: **9 removed, 0
survivors**, live page **12 → 7 cards**, every count matching Firestore. Verified against the
rendered page, not just the API — the script's own check could not have caught an over-deletion,
because a group holding *zero* items also satisfies "not more than one".

**The 9 orphaned registrations across 3 deleted classes are test data** — one protonmail address,
test tokens in the names, $2.12/$4.24 amounts, all April 2026. Left alone deliberately. The
`deleteClass` guard stops new ones.

**Incidental, but it blocked everything for a while:** the checkout's `node_modules` was two majors
behind its own lockfile (typescript 5.9.3 vs 6.0.3, square 43.2.1 vs ^45.0.1), so every `nx build`
failed with `TS5103` plus a phantom `fromLocationId` error. Repaired with `pnpm install`. Vitest
strips types, so unit tests stayed green throughout and only a real build surfaced it — and
`bootstrap-worktree.sh --link-node-modules` cannot catch this class of drift, because its guard
compares lockfile *files*, which matched.

### One library, one function — the deploy filter was silently dropping exports (2026-09-14, legacy #872)

The merge deploy builds its `--only` filter from the **library directory name**, one function
per library. Anything else a library exported sat outside every filter, and `firebase deploy`
leaves what it is not asked about alone — untouched if it exists, **never created if it does
not**. No failure, no warning.

Eight functions were in that state. `chargeLessonsNow` (legacy #866) was the live one: written into
`run-lesson-billing` because ADR-029 says prefer an existing library, and never deployed at
all, so Pay ahead failed with `functions/not-found`. Six admin `trigger*` twins of scheduled
jobs were the same shape, and `healthCheck` was worse — declared inline in the entry point,
with no library behind it for any filter to name.

**The fix is to hold the invariant rather than teach the filter to expand.** One library
deploys exactly one Cloud Function, named after it, so the directory name *is* the function
name and the filter is correct by construction. Each of the eight got its own library; the
twins import their sibling's logic across `@maple/firebase/maple-functions/<slug>`, so the
scheduled job and its manual twin still share one implementation and nx marks both affected
when it changes.

`tools/check-function-library-names.ts` now parses the entry points and enforces the bijection
in both directions — too few exports (the legacy #835 batch-killer, where the filter names nothing)
and too many (this bug), plus inline exports that belong to no library. It used to check only
the first half, which is why this was invisible.

**The count baseline went 236 → 244, and that is an accounting correction, not growth.** The
ratchet counts library directories as a proxy for deployed functions; with seven functions
riding along inside other libraries it was undercounting by exactly that much — #89's
complaint, made concrete. The rule text at `.claude/rules/firebase-functions.md` said a
library "may export more than its own name … a scheduled job plus its admin trigger twin is
the usual shape", which is what led legacy #866 straight into this, and now says the opposite.

Also fixed: `charge-lessons-now.spec.ts` read `SQUARE_MOCK_SERVER_PORT` directly and fell back
to 9997, so every test in it failed with ECONNREFUSED in a port-offset worktree — the same
trap `link-student-card.spec.ts` documents. It uses `EMULATOR_CONFIG` now.

### Student page: lessons and billing as tables (2026-09-13, #84, #88)

`/students/[id]` showed lessons as two lists (Upcoming / Past), invoices as a third list, and card
charges in a card above everything. Now it is two Material React Table tables.

**Lessons** open sorted by date/time, soonest first, with **Show past lessons** off. "Past" means a
lesson with an outcome (taught, no-show, cancelled). A past lesson still `scheduled` stays visible,
because it is waiting on "Mark taught" and hiding it would hide the studio's most common action.

**Billing** merges invoices, automatic charges (#81) and manual charges (legacy #864) into one table,
also date-sorted, with **Show paid & closed** off. `failed` is never "closed": it is money earned and
not collected. A block charge is one row with one amount and the span of lessons it covers, so four
lessons paid in one go never reads as four charges. This replaces `InvoiceList` and the
`UpcomingChargesCard` on the student page; the card still serves `/lesson-billing`. The records are
unchanged (`buildBillingRecords` in `@maple/ts/domain` is presentation only).

Manual charges (legacy #864) are labelled from `source === 'manual'` or the `MANUAL_CHARGE_RULE_ID`
sentinel. A failed charge gets **Try again** on its own row, which calls `chargeLessonsNow` with the
original charge id, so an attempt that already reached Square comes back as the same payment.
`PrepayLessonsCard` stays as its own card above the tables: taking a payment is a different job
from reading the ledger.

**Shared MRT options, as #88 asked for first.** `brandTableOptions()` in `@maple/react/ui` carries
the brand surfaces and both pinning fixes (`mrtTheme.baseBackgroundColor`, pinned-cell
`opacity: 1`). `StudentList` now spreads it too; each new table's story carries the pinning
assertions. Five DataGrid tables remain.

**A play story caught a sort bug nobody would have seen in a screenshot.** MRT sorts numeric
columns descending first, so on a table that opens ascending by date, one header click *removed*
the sort and dropped the rows into load order. The table looked sorted and wasn't.
`brandTableOptions` now sets `enableSortingRemoval: false`, so every MRT table flips between
ascending and descending only.

**The page is covered end to end.** `apps/maple-spruce-e2e/src/student-page.spec.ts` runs in the
existing Portal E2E CI job against seeded emulators. It proves the wiring the stories cannot: the
charges reach the billing table, and Waive, Cancel and Mark paid hit the server and survive a reload.
The seed (`student-page-seed.ts`) reseeds before each test, so a retry starts clean.

Not done here: #828's original idea of a billing column on each lesson row.

### Paying ahead for a block of lessons (2026-09-13, legacy #864)

Some families agree with Katie to pay for the next few lessons up front, in exchange for the
slot being a commitment on both sides. That conversation happens at the desk, so `chargeLessonsNow`
takes the money there and then: next N lessons by default (4), or pick them by hand.

The design decision worth remembering is that a manual charge produces the **same**
`LessonScheduledCharge` an automatic one does, already `paid` with the Square payment id on it.
No second ledger (epic #51 decided that), so the charges screen, teacher payouts and the next
planning run all keep working without knowing which way the money was taken. It also inherits
the at-most-once machinery for free: the atomic `create` at the deterministic charge id **is**
the lease, claimed *before* the payment rather than after.

**A latent double-charge in autopay came out of this.** `planChargesForStudent` blocked lessons
from the start of the whole chargeable list, so a prepayment that did not land on a block
boundary would have been billed again automatically. Fixing that meant subtracting every lesson
an existing charge already covers *before* blocking — and that closes a bug that has been sitting
in the scheduled job since #81: a charge's id is keyed on its first lesson, so cancelling that
lesson re-forms the block around a different one, earns a *different* id, and the
`createIfAbsent` collision that normally means "already handled" never fires. Every remaining
lesson in a paid block would have been charged a second time. Matching on lessons rather than on
the id is immune to it. There is a regression test pinning both behaviours.

`failed` is deliberately the one status that does **not** cover its lessons: nothing was
collected, so a human retrying by hand is the intended recovery. The retry reuses the original
idempotency key, so an attempt that actually reached Square comes back as the same payment
instead of a second one.

The Square payments mock was lying about exactly this — it minted a fresh payment per call and
ignored idempotency keys entirely, so a double-charge bug would have passed the suite. It now
returns the original payment for a reused key, the way real Square does, and can be told to
decline so the failed-then-retry path is actually exercised.

### A one-field index froze every Firestore index deploy (2026-09-04, legacy #826)

`deploy_firestore_indexes_dev` has failed on every merge since legacy #818 with
`400, this index is not necessary, configure using single field index controls`. Firestore
auto-creates single-field indexes and refuses a declaration for one, and it fails the *whole* file:
no index in `firestore.indexes.json` reached dev or prod while that entry sat there.

The entry was not hand-written. `tools/check-firestore-indexes.ts` emitted it, because
`needsCompositeIndex` counted **clauses** where Firestore counts **fields**.
`LessonRepository.findAll({ from, to })` writes a two-sided range as two `.where()` calls on
`scheduledAt` and orders by `scheduledAt`; that read as "2+ filters, needs an index", and
`deriveIndexFields` then deduped it back to the single field, producing a shape Firestore rejects.

The analyzer now reasons over distinct fields, and treats the derived shape as the authority:
fewer than two fields means no composite index exists to declare. It also checks the other
direction for the first time. Every *declared* index must be legal, so a pasted or hand-added
single-field entry fails at PR time instead of at merge-time deploy. The rules moved into
`tools/firestore-index-rules.ts` and finally have unit tests; the AST walking stayed put.

### Standing lesson schedules, PR 2: Katie edits the arrangement (2026-09-04, legacy #797)

The student page now leads with **Standing schedule** — "Tuesdays at 4:00 PM · 30 min · Katie
McCoy" — above the lesson rows. Moving a student to a new day is one edit instead of twelve. The
concrete lessons are still listed underneath; they are just no longer the thing being managed.

**Three things the screenshots caught that the tests could not.**

- **The start date was read in the browser's timezone.** `startsOn` is a date-only fact stored as a
  timestamp, so a schedule beginning Jan 6 displayed as Jan 5 — and because the dialog writes that
  same value straight back on save, an untouched edit could walk a schedule's start date backwards
  one edit at a time. Both the card and the dialog now read and write it in **shop time**, reusing
  `zonedDateKey` / `zonedWallClockToInstant` from PR 1. A story pins the behaviour, because the next
  person to see "Jan 5" on a Jan 6 fixture will otherwise "fix" the working code.
- The confirmation said "Tuesdays at **16:00**" while everything else said "4:00 PM". Now uses the
  existing `formatMinutes`.
- The fixture that exposed the first one was itself unrealistic (`T00:00:00Z` — genuinely 7pm the
  previous day in ET). Corrected to midday shop time, which is what the dialog and the backfill both
  actually produce.

**The weekday is derived from the block, not asked for.** A `LessonBlock` already *is* a weekday and
a window, so asking twice lets the two disagree and the server would reject the result. The form
narrows to the chosen teacher's blocks and validates block fit before saving, which is the same rule
the server enforces — shown before the save rather than after it.

**Changing an arrangement never rewrites lessons already on the calendar**, and the card says so.
Some of those are taught, invoiced, or paid; the new pattern applies going forward. "I changed the
day and next week didn't move" needs to be a documented rule, not a surprise.

### Backfill run against production

`tools/backfill-lesson-schedules.ts --prod --execute` created **5 schedules** (4 active, 1 ended) and
stamped 29 lessons. Its dry run is what caught two bugs in the tool before they reached data: three
"arrangements" inferred from single lessons, and two students sharing one teacher's Tuesday 17:00
slot — a permanent weekly double-booking, which turned out to be a slot handed from one student to
another.

Left needing a human, as intended: **three students** — one of Nathan's with no lesson since May and
no series to infer from, one with a single lesson (correctly refused as not a pattern), and one with
no lessons at all. There is also a lesson pointing at a deleted student record.


### Standing lesson schedules, PR 1: the arrangement becomes an object (2026-09-04, legacy #797)

Katie and Nathan think in standing arrangements — "Nathan teaches Devin on Tuesdays at 4:00". The
portal made them manage rows of concrete lessons, which is why moving a student to a new day meant
editing every remaining row, and why **a series just ran out** on some future Tuesday with billing
stopping silently behind it. `/suzuki` promises rolling enrollment, so that was the normal case.

`StudentLessonSchedule` is that arrangement. Concrete `Lesson` records still exist and are still what
everything downstream reads; they are demoted from "the thing a human manages" to "a materialised
window".

**Three things worth remembering.**

- **Wall-clock, not an instant.** The arrangement stores a weekday and minutes-from-midnight *in the
  shop timezone*, exactly as `LessonBlock` does. `zonedWallClockToInstant` converts, and there are
  tests proving a 4:00pm lesson stays 4:00pm across both the March and November transitions. Adding
  a fixed 7 × 24h — the obvious implementation — silently moves the whole studio by an hour for half
  the year.
- **Exceptions are free, because of the id.** A materialised lesson's document id is
  `sched-{scheduleId}-{YYYY-MM-DD}` in shop time, written with `create()`. A collision is the steady
  state, so re-running creates nothing; **skipping a week** is just cancelling that lesson (the
  document still exists, nothing recreates it); **moving a week** is just editing its time. There is
  no exceptions table, because there is nothing one would know that the lesson does not.
- **The migration trap.** Lessons from before schedules do NOT have that id, so a schedule covering
  the same dates would create a second lesson beside each one — doubling a student's week. Two
  defences: `tools/backfill-lesson-schedules.ts` starts each inferred arrangement the day *after* its
  series' last lesson, and the materialiser additionally skips any instant the student already has a
  lesson at, whatever its id. Both are covered by tests.

A schedule change deliberately does **not** rewrite lessons already on the books. Some are already
taught, invoiced, or paid; the new pattern applies going forward, and anything already scheduled that
should move is moved as an ordinary lesson edit.

**PR 2** is the editing experience: the schedule editor, the student view reoriented around standing
slots rather than rows, and move/skip as first-class actions.

**Recovered mid-flight:** the two new domain files vanished during a branch switch made for an
unrelated footer-snippet fix, after their tests had passed. Rewritten and committed immediately.
Checkpoint new files before switching branches in a worktree.


### Needs Attention: six invisible states, now a to-do list (2026-09-04, legacy #807)

Six things were already true in the data and none of them surfaced anywhere, so finding any one meant
going looking, per student. Each is money or compliance quietly going wrong — an invoice that never
reached Square means **the family was never asked to pay at all**.

The panel sits on the dashboard and on `/my-day`, and it obeys two rules that shaped the whole thing:

- **It renders nothing when there is nothing to do.** Not an empty card — nothing. A panel that is
  usually empty trains people to stop reading it, at which point it is worse than not existing.
- **Every row can be acted on from where it appears.** Either the panel fixes it inline (only one
  qualifies today: turning on automatic invoicing, which is a single boolean) or the row links to the
  *exact record*, never to a list to search. A row that can only be described was not worth adding.

**Groups are ordered by the cost of ignoring them, not by count.** One invoice that never reached
Square sits above nine students with a flag off. Sorting by count would bury the emergency under the
nuisance, which is how these panels usually die.

**It needs no new composite index.** It reads students, lessons, blocks and invoices unfiltered and
composes in memory, the way `getTeacherPayouts` already does. The alternative was six filtered,
mostly multi-field queries — six indexes to maintain for a dataset of a few hundred documents. The
code says so, so nobody "optimises" it into six indexes later without knowing why it wasn't.

**Scoping is a real behaviour, not a filter.** An admin sees everything; a lesson teacher sees only
their own students and lessons (`instructorIdForUser`, legacy #616). The response carries `scopedToSelf` and
the panel says "showing only your own students" — because an empty panel means *"nothing is wrong"*
to Katie and *"nothing of yours is wrong"* to Nathan, and those are different claims.

The classifiers live in `@maple/ts/domain` as pure functions, so each "is this wrong?" rule has one
definition rather than one in a query and a second in a component. Two of them encode judgements
worth keeping: a **no-show counts as unbilled** for private pay (the slot was charged), and a
**Hope student is never flagged for `autoInvoice`** because `createInvoice` refuses Hope outright, so
the row would be noise nobody can act on.


### Hope Scholarship billing has a ledger (2026-09-04, legacy #799)

`Student.isHopeScholarship` did exactly two things: make `createInvoice` throw, and render a banner
restating the EMA rules. **Nothing recorded what had actually been claimed.** That ledger lived in
the EMA portal and in Katie's memory, and unlike a Square invoice there was no unpaid state to chase
— a missed submission was simply money never collected, silently.

`/hope` now answers one question on one screen: **what have we taught a Hope student and not been
paid for?**

**Three decisions worth remembering.**

- **There is no `pending` status.** A lesson is awaiting submission when it has *no* submission
  document, or when its document was `rejected`. So nothing has to materialise a row per lesson, and
  no lesson can be lost by failing to get one. The document id **is** the lesson id, so a
  rejected-then-resubmitted lesson updates its own record instead of accumulating duplicates that
  could be claimed twice.
- **A rejection counts as still owed.** EMA refusing a claim means the studio taught the lesson and
  has not been paid — financially identical to never having claimed it. It goes back in the queue and
  is reported separately only because it needs a different action.
- **The rate is stamped once.** A later rate change must not retroactively restate what EMA was
  actually told, so `recordHopeSubmissions` keeps the original `rateCents` when a claim moves to paid.

**The no-show guard is on the write, not just the read.** The queue filters on `isSubmittableToHope`
(legacy #796), *and* `recordHopeSubmissions` re-checks every lesson server-side. Hiding a no-show in the UI
is not enough: a stale client could otherwise claim public money for a lesson nobody attended. Both
halves are covered by integration tests.

**Historical entry reuses `createLessonSeries` rather than adding a parallel shape.** It gained an
optional `status`, so a backfill is "the same series creation, with past dates, already rendered".
Everything downstream — payouts, the Hope queue, the room schedule — reads ordinary `Lesson` records,
and a separate "historical lesson" entity would have had to be taught to all of it.

Block attribution (legacy #686) is **waived for a backfill only**. That rule stops *new* lessons being
dropped at arbitrary times; a lesson that already happened happened whether or not a block covers
that weekday, and refusing to record it would mean refusing to claim money the studio has earned.
Backfilled lessons carry `blockId: null` and surface as "needs a block" — the existing grandfather
path. An integration test asserts a **future**-dated series without a block is still refused, so the
exemption cannot become a hole.

**The index analyzer earned its keep**: the new Hope query needed a `lessons` composite index on
`studentId + status + scheduledAt` that the emulator would never have complained about. Declared in
the same PR, per the rule.

**Still open (#83):** the EMA export format, moving payouts to count Hope at *paid* rather than
*rendered*, and making Hope rates admin-editable. All three wait on answers.


### `no-show` is its own lesson status, and it bills in two directions (2026-09-04, legacy #796)

`LessonStatus` was `scheduled | rendered | cancelled`. Registrations have carried a `no-show` all
along; lessons never got one, so a no-show had to be filed as `rendered` (a lie, and for a Hope
student a compliance problem) or `cancelled` (which frees the room, loses the fact, and drops the
teacher's payout credit).

**The billing rule, from David:** a no-show **is charged** for private pay — the slot was held and
the teacher was there. A Hope no-show is charged to **nobody**: Hope pays only for services rendered,
and the family does not owe it privately either, so the studio absorbs it.

That is why this is a third status rather than a flag on `cancelled`. Two helpers encode it, and
everything routes through them so the rule cannot be re-derived differently in two places:

- `didConsumeSlot(status)` — rendered **or** no-show. The private-pay billing trigger and the
  room-occupancy test. A no-show still occupied the Spruce Room, so `onLessonWrite` keeps its
  calendar event; only an outright cancellation frees the room.
- `isSubmittableToHope(status)` — **rendered only**. `isLessonPayoutEligible` now calls it instead of
  comparing to `'rendered'` itself, so the payout aggregator and legacy #799's EMA submission queue cannot
  disagree about what Hope may be billed for. A domain test asserts the two sets are strictly nested
  and that `no-show` is never in the Hope one.

`onLessonRenderedInvoice` now fires on the edge into **either** billable status. Guarding the *edge*
rather than the new status is what stops a `rendered → no-show` correction from invoicing the family
a second time, and there are unit and integration tests for that specific mis-tap. The invoice line
for a no-show says **"Missed lesson"** — billing someone for a "lesson" nobody attended invites a
dispute they would be right to raise.

**Integration coverage was added where there was none.** `onLessonRenderedInvoice` had unit tests
that mock every repository, and nothing proving the trigger actually fires in a real Firestore. This
slice makes one trigger decide money in two directions, so both guarantees are now proven against the
emulator: a private-pay no-show produces a sent invoice with the right words on it, and a Hope
no-show produces nothing at all.

UI is built on legacy #805's pattern: on `/my-day` "No-show" sits beside "Mark rendered" (two taps stays two
taps), and in `LessonList` it is an overflow item — "it happened" is the overwhelmingly common
answer, and two competing primaries on every past row would slow the common case to help the rare one.

**This unblocks legacy #799.** The Hope submission queue can now exclude no-shows structurally instead of
hoping a UI filter remembers to.


### Lesson row actions: labelled primary + overflow, per-row progress (2026-09-04, legacy #805)

David: the lesson action buttons are vague, have no progress state, and are a weird pattern. Looking
at it, **`LessonList` was the outlier, not the house style** — `StudentList` already uses a
`MoreVert` overflow of labelled `MenuItem`s. So this removes a deviation rather than inventing a
convention.

What was actually there: three bare `IconButton`s with no tooltips (only `aria-label`, which helps a
screen reader and does nothing for a sighted person hovering a mouse), an orange cancel a few pixels
from the green mark-rendered at `size="small"`, and **no busy state at all** — the student detail
page tracked `isSubmitting` and simply never passed it to `LessonList`. `MyDayLessonCard` had real
labelled buttons but one page-wide `busy` boolean, so acting on one lesson froze every card in the
day and nothing said which action was running.

Now: **"Mark rendered" is a labelled button**, everything else is behind one overflow, and pending
state is **per row and per action** (`{ lessonId, action }`), so the pressed control shows progress
and its siblings stay live.

**The bug the tests could never have caught.** MUI's `ListItem secondaryAction` positions its content
*absolutely*, so the row text reserves no space for it. That was fine for three 20px icons and wrong
the moment one became a labelled button: at 420px the button sat on top of the row's own chips. Found
by screenshotting the story in Storybook at narrow width, per `.claude/rules/verification.md` — 19
green interaction tests said nothing about it. The actions are now a real flex sibling with
`flexShrink: 0`, and the text wraps around them.

Two corrections to the issue as originally filed: cancelling a lesson **already** has a confirmation
(`DeleteConfirmDialog` on the student page), and the missing double-click guard was never a
double-billing risk — `createAutoLessonInvoice` uses a deterministic per-lesson invoice id. The cost
was a user who could not tell whether their click landed.

`InvoiceList` has the identical pattern (five bare icon buttons plus a nested menu) and is the
obvious follow-up; left out to keep this reviewable and lesson-focused.


### Lesson inquiries land in the portal (2026-09-04, legacy #795 / epic #80)

An inquiry used to live in Tally and in Katie's inbox and nowhere else — `tallyLeadWebhook` fires two
analytics beacons and writes nothing. There was no way to answer "who asked us about lessons three
weeks ago and never heard back", which is the one question a paid funnel has to answer. With the
Suzuki ad going live in about two weeks, that gap was the next thing worth closing.

**The design decision worth remembering: this is a scheduled poll of the Tally API, not a second
webhook.** Persisting from `tallyLeadWebhook` was the obvious approach and is the wrong one.

- **The webhook is one-shot.** Tally hangs up at 10s and does not auto-retry, so a failed delivery is
  a permanently lost lead. Analytics has to live with that (a late conversion event is worthless).
  A lead record does not — it only has to be *right*, and a failed poll is fixed by the next poll.
- **It would re-inflate `maple-webhooks`**, which is ~90kb / ~2.6s cold precisely so the unretryable
  path keeps its margin (ADR-031).
- **A webhook cannot go back.** There were already **14** submissions sitting in the shared `dWPQOr`
  form, none of them ever in the portal. The first run backfills all of them.

Splitting the two concerns by *mechanism* rather than by bundle dissolved the codebase question that
legacy #795 was originally framed around: a scheduled function has no cold-start budget to protect, so it
lives in `maple-core` with no new codebase and no second webhook to wire.

**The API shape is not the webhook shape, and this was verified rather than assumed.** The webhook
sends self-describing fields (`{key, label, type, value}`); the submissions API returns `questions`
once per page and `responses` as `{questionId, answer}`, where `answer` is a string, a string array
of already-resolved option **text**, or — for hidden fields — a single object keyed by field name
whose question has `label: null`. Mapping this against the webhook's shape would have compiled,
passed an invented fixture, and captured nothing. The spec fixtures are real captured payloads.

Idempotence is structural: the Firestore doc id **is** the Tally submission id and ingestion uses
`create()`, so a re-poll cannot reset an `enrolled` lead back to `new`.

`/leads` is built on the action pattern legacy #805 is moving the lesson surfaces onto — one labelled
primary action, a `MoreVert` overflow, and **per-row** pending state rather than the page-wide `busy`
boolean `/my-day` still uses. No reason to build a new surface with the defect we just filed.

**Manual step, and the deploy fails without it:** set the **`TALLY_API_KEY`** secret in each
project's Secret Manager before this merges. A declared-but-unset `defineSecret` breaks the deploy
(#44 would detect this; it is still open).

**Not done here:** the acknowledgement email to the family. Tally respondent notifications need Tally
Pro, and `queueMail` still cannot enter `maple-webhooks`. Now that inquiries are Firestore documents,
the natural home is a trigger on `lessonInquiries` — worth its own slice.

### Suzuki intake form + lead attribution (2026-09-03, legacy #794 / epic #80)

An audit of the lesson funnel against the live site found that **`/suzuki` was pointed at the generic
`dWPQOr` "Music Lesson Inquiry" form**, which reports no conversion event to Meta or GA4 at all:
`resolveFormAttribution` maps two Tally form ids (the M&S newsletter and the MT newsletter) and
`dWPQOr` is not one of them. Running a Suzuki ad against that would have optimized on an
iOS-degraded browser pixel signal with no CAPI and no dedupe id.

New Tally form **`QKQb6k`** ("Suzuki Lessons at Maple & Spruce"), brand-styled, Suzuki-only, and
asking the three things the old form never did: the student's age, when the family can actually come
in, and whether they are a **Hope Scholarship** family. That last pair is what lets the first reply
offer a real slot out of the Openings tab instead of starting an email thread.

**`content_category` is now per-form, not hardcoded `'newsletter'`.** Both halves of the Meta event
(the footer snippet and `tallyLeadWebhook`) previously stamped every lead as a newsletter signup.
The Suzuki funnel reports to the *same* M&S pixel as the newsletter, so that field is the only thing
telling Meta a $130/month lesson lead apart from an email signup, and the ad account optimizes
against whatever it is told the event is. Both halves send `lesson-inquiry` on the shared `eventID`.

`dWPQOr` is untouched and still serves `/music` and `/music-lessons` (fiddle, harp, old-time). The
`apps/functions-webhooks` bundle went 93.1 → 93.9 kb with no new dependencies, which is the point:
Tally hangs up at 10s and does not retry, so that codebase stays tiny (ADR-031).

**Family acknowledgement is not done.** Tally respondent notifications require Tally Pro (the API
refused it, `upgradeTrigger: RESPONDENT_EMAIL_NOTIFICATIONS`), and `queueMail` cannot go in
`maple-webhooks` without re-inflating the bundle. It moves to **legacy #795**, where persisting the lead
forces the codebase decision anyway.

**Manual steps, in this order:**
1. Merge and let CI deploy `tallyLeadWebhook`.
2. **Then** connect `QKQb6k`'s Tally webhook to `…cloudfunctions.net/tallyLeadWebhook` with the
   existing `TALLY_WEBHOOK_SECRET`. Wiring it first files those leads into the wrong Meta dataset and
   Meta cannot move them later — exactly what bit `q4Qj8d`.
3. Re-paste `tools/webflow-tally-form-events.html` into Webflow → Site Settings → Custom Code →
   Footer Code. The repo copy is authoritative but nothing deploys it.
4. Publish the Webflow site (the `/suzuki` embed is already swapped in the Designer, unpublished).

Also corrected `docs/reference/REQUIREMENTS.md`, which claimed music lessons were built and complete.
The admin surface is; the funnel and the billing automation are not. Epic **#80** holds the six
slices, and `docs/reference/suzuki-readiness-plan.md` is the standing execution plan.

Closed **legacy #362** (add Nathan as an instructor) as stale — he has been live at
`/instructors/nathan-zucker` for a while.

### Music Together pilot half-off: discount codes at checkout + waivable installments (2026-09-03, legacy #791)

Stephanie wants to thank the families who came to the first demo with **half off** their first
semester ("pilot discount", code `PilotClass`). One family had **already registered** on the
installment plan before the offer existed, so the discount had to reach existing registrations too.

**The arithmetic is what makes this tractable.** MT tuition is $252 paid in full, or 2 x $132 = $264
on the plan (the plan carries a premium). So for a family already on the plan, **waiving installment
2 is exactly 50% off** — no refund, no partial anything. Stephanie's framing and the code path land
on the same number.

**Two halves, both needed:**

- **New families — a code at MT checkout.** MT had *no* discount concept: `CreateMusicTogetherRegistrationRequest`,
  the registration entity, the Vest suite, and the widget all lacked the field, and pricing came
  straight from the section's `priceFullCents` / `installmentPlan` via the sibling multiplier. The
  new `mtApplyDiscount` sits next to `computeMusicTogetherFamilyPrice` in `@maple/ts/domain` and is
  called by **both** the server (authoritative) and the widget (display), so the two can't drift.
- **Existing families — `waiveMusicTogetherInstallment`.** A new terminal `waived` status on
  `MusicTogetherScheduledCharge`, plus a per-charge Waive action on the admin roster.

**Four decisions worth remembering.**

- **A discount reaches every amount, the scheduled Week-5 charge included.** Discounting only the
  charge taken at registration would bill the family full price four weeks later, after the widget
  told them otherwise. The integration test that matters is
  `installments: halves the first charge AND the scheduled Week-5 charge`.
- **Pay-in-full and the installment plan are discounted *independently*, and reported separately**
  (`fullDiscountCents` / `installmentsDiscountCents`). A single "discount amount" is invisible for a
  percent code and *wrong* for a fixed-amount one — the two plans are different prices and the family
  picks exactly one. The first version collapsed them and reported the plan reduction on a
  pay-in-full registration; the integration suite caught it. A fixed `amount` comes off the plan
  **total once**, then apportions across installments (largest-remainder, so the parts still sum).
- **`appliesTo: 'nth-slot-onward'` is rejected for MT**, not silently treated as an order discount.
  MT prices a family, not slots, and additional children already get the sibling discount (legacy #599).
- **`waived` is not `cancelled`.** Both stop the charge job, but `cancelled` means the family left.
  A comped installment has to stay legible on the roster, so the status, the reason, and the waiving
  admin are all recorded. A payment failure also **returns** a consumed redemption — burning a
  single-use pilot code on a declined card would lock the family out of the offer entirely. (Customer
  *cancellation* still consumes it, unchanged.)

### Program scoping: codes belong to one checkout, and two filtered admin pages

Shipped in the same PR, because the feature is unsafe without it. `Discount` had **no scoping at
all** — `appliesTo` is only `'order' | 'nth-slot-onward'`, and both checkouts did a bare
`findByCode`. A `PILOTCLASS` created for Music Together would also have taken 50% off any Maple &
Spruce craft class. The two programs settle to **different Square accounts owned by different
businesses**, so that isn't a discount bug, it's money moving between two companies' books.

`Discount.program` (`'classes' | 'music-together'`) is now enforced at four places that must agree:
the public `lookupDiscount`, the classes price preview (`calculateRegistrationCost`), the
authoritative classes charge (`reserveClassRegistration`), and `createMusicTogetherRegistration`.
Wrong-program codes are refused on the **same branch, with the same wording**, as unknown codes —
`lookupDiscount` is unauthenticated, so a distinct message would let anyone enumerate the other
business's live promotions.

**Four decisions worth remembering.**

- **Legacy documents back-fill to `classes`,** which is a statement of fact rather than a guess: MT
  had no discount support before this, so every pre-existing code was authored for class checkout.
  Defaulting the other way would silently expose Stephanie's account.
- **Codes stay globally unique across programs.** A customer types a code without knowing which
  program owns it, so one string must mean one thing everywhere. `createDiscount` names the owning
  program in the collision message, because "already exists" is baffling to an mt-teacher who can't
  see the classes code that collided.
- **`program` is immutable, like `type`.** It isn't on `UpdateDiscountInput` at all — repointing a
  live code would change what a customer holding it can buy.
- **The role gate is two halves.** The four admin functions moved from admin-only to
  `[Admin, MtTeacher]` so Stephanie can run her own promotions; `assertCanManageDiscountProgram` /
  `discountProgramScopeForUser` then keep her off class codes. Reads **force** a non-admin to
  `music-together` regardless of the requested program — the client's filter is never an
  authorization input. Update and delete authorize on the **stored** program, the one whose money is
  at stake.

**The admin UI is one component, two pages.** `DiscountsManager` holds the entire experience;
`/discounts` pins `program="classes"` and `/music-together/discounts` pins `music-together`, and
they differ only in that plus their copy — so the two can't drift. The program is never a form
field: the page already says which one you mean, and it's immutable afterwards. The per-slot
"Applies To" control is hidden on the MT page (and rejected by the Vest suite) because MT prices a
family, so a slot-scoped MT code could never be redeemed.

**A composite index was required and would not have shown up in tests.** `findAll({ program })` runs
on every load of both pages, and the Firestore emulator does not enforce composite indexes — the
whole integration suite passed green while both pages would have 500'd in prod.
`tools/check-firestore-indexes.ts` caught it; two `discounts` indexes are now declared.

**Still to do (owner actions, not code):** create the `PILOTCLASS` discount in the admin Discounts
page — now under **Music Together → Discounts**, and it is stamped `music-together` automatically
(50% / order / with a usage cap or expiry if the offer should close) — then waive installment 2
for each family who registered before the offer. Anyone who paid **in full** before the offer needs a
$126 refund through Cancel / refund instead — waiving does nothing for them.

### Music Together spot counts never reached the public site (2026-09-03, legacy #800)

Stephanie reported the Thursday Morning section still advertising **8 spots left** after a family
registered (admin showed `1 / 8 families`). It was not a device cache — the stale number was in the
server-rendered HTML.

`spots-remaining` / `spots-display` on an MT section were written by exactly one thing:
`syncMusicTogetherSectionToWebflow`, a trigger on `musicTogetherSections/{sectionId}`. A registration
never touches the section document, so the count Webflow captured at the last admin edit was frozen
there. Classes have had the equivalent trigger since legacy #143 (`syncRegistrationCount`); MT never got one.

`syncMusicTogetherRegistrationCount` is that mirror — a trigger on
`musicTogetherRegistrations/{registrationId}` that re-syncs the owning section.

**Three things worth remembering.**

- **This costs a function (baseline 218 → 219) and that is deliberate.** ADR-029 pushes new
  *endpoints* onto domain routers, but a router route cannot express a Firestore trigger on a new
  document path. The zero-function alternative — folding the sync into `sendMusicTogetherConversion`,
  the only other trigger on that collection — would have pulled `webflow-api` into `maple-core`,
  the heaviest bundle, to save one Cloud Run service. The other zero-function option (having
  create/cancel touch the section doc so the existing trigger fires) works but makes the data flow
  implicit; the explicit trigger is what a reader will find when this breaks again.
- **The guard is load-bearing, not an optimization.** The registration document doubles as the
  per-family bookkeeping channel: `sendMusicTogetherReminders` calls `markReminderSentForSession`
  once per family per session, so every reminder day rewrites every enrolled family's document.
  Without `COUNT_RELEVANT_FIELDS` (`sectionId`, `status`) a 12-session term would fire
  (families × 12) Webflow publishes producing byte-identical field data. `children` is deliberately
  *absent* from that list — capacity is per family, so adding a sibling consumes no spot.
  (The Week-5 installment job writes `musicTogetherScheduledCharges`, not the registration doc —
  it only reads the registration.) That a hand-maintained field allowlist is what stands between a
  bookkeeping write and an outbound publish is the argument for #82.
- **Hidden sections are skipped, not synced.** A hidden section has no CMS item (the section trigger
  removes it); syncing one here would resurrect a card that was deliberately pulled.

**Verification**: 23 unit tests; 5 integration tests against the emulators + the Webflow mock
(`sync-mt-registration-count.spec.ts`) asserting the `fieldData` actually sent to the CMS —
registration drops the count, cancel and delete give the spot back, and the last spot flips
`spots-display` to `Full` and `status` to `full`. Full MT suite: 99 passed.

**Note for the fix-forward**: existing sections still hold whatever count Webflow last captured.
Re-saving each affected section in admin republishes it with the live number.

---

### Server-side Meta signals for MT demo RSVPs + interest signups (2026-08-22, legacy #781)

The first Music Together campaign spent $124.43 over nine days — 8,319 reached, 389 link clicks,
328 landing page views — and reported **zero** pixel-attributed conversions. Some of that was a
targeting problem, already fixed on the Meta side. But we could not tell *"nobody converted"* from
*"the signal never arrived"*, because the demo RSVP was the only step in the MT funnel with no
server-side backup, and no hashed email for those RSVPs had ever reached Meta — so there was also
nothing to seed a lookalike audience from.

**The demo RSVP is the conversion this program optimizes against.** Paid enrollment happens weeks
later and in single digits; `Schedule` is the only MT event with enough volume to train a bidder.

**Four things worth remembering.**

- **These two send INLINE, unlike every other conversion here.** `sendMusicTogetherConversion` is a
  Firestore trigger because its conversion happens later than any request (Square's webhook flips
  the doc minutes after checkout). An RSVP is born final — the conversion *is* the request, and the
  browser needs the `event_id` back in that same response. `tallyLeadWebhook` is the closer
  precedent. A trigger would also have cost two Cloud Run services against the ADR-029 ratchet for
  no behavioral gain; **this change adds zero functions** (baseline still 218). The send is capped
  at 2s (`MT_TOP_FUNNEL_CAPI_TIMEOUT_MS`, vs the library's 5s) because it blocks a form submit, and
  double-wrapped so it can never fail an RSVP.
- **The `event_id` is a hash, not the doc id.** Both collections are keyed by the family's
  **lowercased email** for idempotency, so the obvious `mt-demo-<docId>` would have shipped a
  plaintext address to Meta in an unhashed field. It is `mt-demo-<sha256(demoId:email)[0:16]>` /
  `mt-interest-<sha256(email)[0:16]>` — stable across the pair, unique per (demo, family), derivable
  from the stored document (so promoting to a trigger later is a no-op on the wire), no PII. **The
  server owns the format**; both widgets pass the response value through verbatim.
- **The server half fires only on `created`.** Both endpoints are public and unauthenticated —
  sending on every call would let anyone inflate a campaign's conversion count by replaying a
  signup. The browser half still fires on a re-submit under the same stable id, which is what keeps
  Meta from booking it twice. Same reasoning as the email idempotency from legacy #778.
- **`external_id` is the lowercased email on every surface.** That is the thing that lets Meta
  resolve one family's demo RSVP, interest signup, and later enrollment to a single person — the
  basis for a lookalike off the RSVP. `country: 'us'` is now sent unconditionally everywhere; and
  the MT registration address, the only address we collect, is finally split into `ct`/`st`/`zp` by
  a deliberately conservative `parseUsAddress` (a wrong city hash matches nobody while *looking*
  like a supplied key, so anything ambiguous is dropped — including bare two-letter English words
  that collide with USPS codes: `me`, `in`, `or`, `ok`, `hi`, `la`, `pa`, `id`).

**Verification**: 2917 unit tests; 12 new integration tests against the emulators + the CAPI mock
(`music-together-top-funnel-conversions.spec.ts`) asserting event name, `event_id`, hashed `em`, and
fbp/fbc/IP/UA passthrough; and a Storybook `play` story driving the real demo widget in Chromium and
asserting the `Schedule` carries the server's `eventID` (verified to fail when the id drifts). The
Storybook stories glob now covers `apps/webflow-components/` — the public widgets carry the ad
tracking that pays for the classes and had no browser-level coverage.

**Still to do (manual, cannot be done from the repo):**

1. **Confirm dedup in Meta Events Manager** after deploy — Test Events for pixel `1562555242035326`,
   submit a demo RSVP, and check that `Schedule` appears **once** with both a Browser and a Server
   source. If it shows twice, the `event_id` broke.
2. Mark `Schedule` and `Lead` as conversions in the MT dataset once traffic starts.
3. **#78 — dev and prod still share the production pixel.** This got sharper: it is no longer just
   rare `Purchase` events, it is every dev demo RSVP and interest signup posting a real hashed email
   into the production MT dataset. Do not run repeated dev test signups, and prune test emails
   before building a lookalike off that data.

### Music Together registration email sequences (2026-08-17, legacy #778)

Demo RSVPs and section waitlist signups sent **nothing** until now: both functions wrote Firestore
and returned. Families had signed up and heard back only if someone reached them by hand. This adds
the six-email sequence Stephanie specced (signup / one week out / two days out, for both the free
demo and a full session), plus the two states her doc doesn't reach: a demo RSVP past capacity, and
a section waitlist signup.

**Three things worth remembering.**

- **Sending is gated on `created`, not on the request.** Both endpoints are public and
  unauthenticated, so emailing on every call would let anyone mailbomb an address by replaying a
  signup. The per-(demo, email) / per-(section, email) idempotency is what makes sending safe, and a
  mail failure never fails the signup — the seat is already committed by then.
- **Demo location is a merge field, never the studio address.** Demos are regularly held offsite (a
  public library, a partner space) and `MusicTogetherDemo.location` is required free text for that
  reason. `MT_DEFAULT_LOCATION` exists for *sections* only; using it for a demo would send a family
  to the wrong building.
- **Demo emails can't name the child.** The RSVP widget collects a family name and email only, so
  that copy says "your little one". Section emails, which register children individually, merge
  `{{childNames}}`. Closing that gap needs a Webflow form field, not a code change.

`queueMail({ to, templateName, data, sender })` in `@maple/firebase/functions` is now the single
send path for Music Together. It sets `replyTo: musictogether@…` today and leaves `from` at the
extension default, because Gmail SMTP rejects a `from` the account isn't authorized to send as. That
map is the seam for **#77** (dedicated sending provider, arbitrary validated senders) and **#76**
(Trigger Email decommission 2027-03-31) — when either lands, only `SENDER_FROM` changes.

Reminders run in one daily 08:00 ET function with five idempotent passes: sections meeting today
(weekly nudge), first class at 7d and 48h, demos at 7d and 48h.

**Not yet done:** `tools/backfill-mt-signup-emails.ts` is written and dry-run-safe but has **not**
been run against prod. Families who signed up before this shipped are still unacknowledged until it
runs with `--send`.

### Related classes moved from a Cloud Function to the Webflow CMS (2026-08-17, legacy #776)

The sold-out panel on a class page used to fetch sibling classes through
`getRelatedPublicClasses`, a callable in the `maple-core` bundle (~6.1s cold, ADR-031). It only ran
on a full class, so it was effectively always a cold start and the section took seconds to appear.
The class template page now renders those cards natively from the CMS, in the HTML at first paint.

**What made it possible.** Everything a card needs was already on the Classes collection. Two things
were missing, and both are worth remembering because they shape what the Webflow API can and cannot
author:

- **Conditional visibility is not API-authorable**, but an element's *visibility can bind to a Switch
  field*. So the block binds to a new `is-full` switch, written by the sync as `spotsRemaining <= 0`.
  The rule lives in `class.service.ts` rather than as a Designer-only setting.
- **A Collection List filter can compare a field against a *bound* value** — that is how
  "same category as this class" and "not this class" are expressed:
  `category-name equals <current item's category-name>` and
  `firebase-id doesNotEqual <current item's firebase-id>`. The native exclusion means no JS is
  needed to drop the current class from its own list.

**Three API limits found the hard way** (all confirmed, not guessed):

1. An `itemRef` filter rejects bound values outright ("does not support bound filter values in the
   Designer"), so the `category` **Reference** field cannot drive the filter from the API. Plain-text
   fields *do* accept bound values, which is why the filter runs on `category-name`.
2. A Link's `link` setting has **no bindable sources**, and `{"mode":"collectionPage"}` — byte
   identical to the working link on `/upcoming-classes` — resolves to `href="#"` on a *template*
   page. This is the one control that still needs a Designer click.
3. A DOM element's `attributes` cannot be bound either, so the href workaround did not survive.

**Still needed before a production publish:** in the Designer, set the related-card link to the
collection item ("Class"). Everything else is verified on staging.

**Also shipped:** a `Class Categories` CMS collection + `syncClassCategoryToWebflow` trigger and a
`category` Reference field on classes. The rendered filter does not use them yet (see limit 1) —
they exist so the filter can be switched to the reference, which is immune to the rename drift that
`category-name` matching has. Function count is net zero: `getRelatedPublicClasses` was deleted.

---


### Music Together updates banner (2026-08-12)

The MT pages now carry their own signup banner, mirroring the `pre-opening-banner` that sits in
the `maple-nav` component on every Maple & Spruce page. It opens a **new, separate** Tally form
(`q4Qj8d`, "Music Together Maple & Spruce Updates") so MT news goes to its own subscriber list
instead of the shared M&S list (`0QPRq9`).

Built in Webflow, in two places because the MT header exists twice:

- **MT Header component** (`a17e39d5-…`, an HtmlEmbed) — covers `/music-together-calendar`,
  `-policies`, `-demo`, `-interest`.
- **`/music-together`** — that page has its own native copy of the header (it carries the
  current-page `mt-nav-here` highlight), so the banner was rebuilt there as native elements,
  which is also what defines the shared `.mt-banner` / `.mt-banner-text` / `.mt-banner-btn`
  classes the embed markup reuses.

The site-wide footer snippet now routes leads **by Tally form id to the owning Meta pixel** with
`trackSingle` (M&S `1625932185289127`, MT `1562555242035326`), re-using the
`window.__mtPixelInitialized` flag from `music-together-analytics.ts`. Before this it fired a bare
`fbq('track', 'Lead')` under a single hard-coded `form_name`, which on an MT page would have filed
the lead into every initialized pixel.

`tallyLeadWebhook` now routes the server half the same way: `resolveFormAttribution` maps the
Tally form id to `META_PIXEL_ID` or `META_PIXEL_ID_MUSIC_TOGETHER`, and the GA4 event carries
`form_name` / `form_id` so the single GA4 property stays separable. Both halves stamp
`event_id` = `tally-<submissionId>` — Tally reports the same id as `payload.id` on the browser
message and `data.submissionId` on the webhook, so Meta counts each signup once instead of twice
(this double-count existed for the M&S form before this change).

**Remaining manual step**: connect `q4Qj8d`'s Tally webhook to
`https://us-east4-maple-and-spruce.cloudfunctions.net/tallyLeadWebhook` with the existing
`TALLY_WEBHOOK_SECRET`. **Do this after the function deploys** — a form the deployed function
doesn't know about reports into the Maple & Spruce dataset, and Meta can't move those events
later.

**Follow-ups**:
- Subscribers live in Tally only. No MailerLite group / integration yet — deliberate, to be wired
  in Tally's Integrations tab when the list is worth sending to.
- Worth confirming in GA4 that `generate_lead` isn't double-counted for the M&S form: the browser
  snippet pushes it through GTM and the webhook posts it through Measurement Protocol. Whether
  that lands as one event or two depends on the GTM container, which isn't visible from the repo.
- Four test submissions (`verify-mt-*@mapleandsprucefolkarts.com`) to delete from the Tally form.

### Tally webhook timeouts — `maple-webhooks` codebase (2026-08-07)

Tally reported five `timeout of 10000ms exceeded` failures (2026-07-30 → 2026-08-06), one per day
the newsletter form got a signup. Cause was **cold start, not the handler**: prod probes returning
401 (before any handler logic) took **14.4s** in `maple-core` vs 1.0s warm, against Tally's 10s
cutoff. A codebase is one bundle, so `tallyLeadWebhook` was paying the boot cost of all 165
maple-core functions — and at ~1 signup/day the service was cold for essentially every delivery.
Tally does not retry, so each one was a lost lead.

Fix: new `maple-webhooks` codebase (`apps/functions-webhooks/`, 90kb vs 488kb) holding just
`tallyLeadWebhook`, plus `AbortSignal.timeout` on the GA4/Meta beacons. See ADR-031.

**Findings / follow-ups**:
- **No subscribers were lost.** All five affected leads are active in MailerLite (Tally's
  MailerLite integration delivers independently of the webhook). Only the GA4 `generate_lead` and
  Meta `Lead` attribution events were dropped. The five map exactly to Tally's reports — every
  failure followed a 7.7-23h idle gap, and every delivery within ~6h of a previous one succeeded.
- **Resending the 5 from Tally's events log is optional and low-value.** The handler stamps
  `event_time` at send, so a resend today books the leads as today's conversions — it does not
  restore the original dates. Only worth it for the Meta signal (the original `_fbc` click IDs
  still identify the campaign). Must wait until the fix is actually deployed or it will just
  time out again.
- Verify post-deploy that the function re-registered under the new codebase and that a cold call
  now answers well under 10s.

### squareWebhook — `maple-square-webhook` codebase (2026-08-07)

Follow-up to the above. `squareWebhook` was **not** in `maple-core` (an error in ADR-031's first
draft) — it was in `maple-square`. Same 10s ceiling; it survives on Square's retries. Moved to its
own 141kb `maple-square-webhook` codebase; the Firestore-triggered workers stay in `maple-square`.
Webhook URL is unchanged, so no Square dashboard change was needed. Shipped in legacy #761.

**Measured after deploy (2026-08-09), paired sampling:** `squareWebhook` ~3.4s cold vs ~5.7s for
the `maple-square` bundle it left; `tallyLeadWebhook` ~2.6s vs ~6.1s for `maple-core`. Both moves
delivered. Two corrections came out of this: the original "14.4s" for `maple-core` was measured
minutes after a deploy and included an image pull (steady state ~6s), and a single probe is
worthless — the same unchanged function read 7.7s twice then 3.4s twice as the regional image
cache warmed. Always pair against a control and repeat. See ADR-032.

### Public-site SEO cleanup (2026-08-07)

Search Console reported 1 "Unparsable structured data — Parsing error: Missing ',' or '}'". Swept all 62 sitemap URLs and JSON-parsed every `ld+json` block to find it: the **Shop** page's JSON-LD had four string literals truncated mid-value, each clipped ~40 characters into its line by a bad paste. Rewrote it through the Webflow API as a structured object (no paste path) and published. All sitemap URLs now parse.

Two adjacent problems found and fixed while in there:

1. **Every CMS detail page shared one static `<title>`** — classes, instructors, artists, and MT sections all rendered the template's literal SEO title (all 28 class pages said "Class Registration | Maple & Spruce Folk Arts Collective"). Fixed by binding each template's SEO title/description to CMS fields via `bulk_update_pages` (Webflow `{{wf {"path":...}}}` tokens work through the Data API), verified on the staging subdomain, then published.
2. **Past classes never came down** — 19 of 28 live class pages were for classes that had already happened, accumulating in the live site and the auto-generated sitemap. Unpublished them (sitemap 62 → 43 URLs) and added the `expirePastClassPages` scheduled function so it does not drift back.

Note: the dev-CMS-leak guard from legacy #728 is working — all 21 dev-synced class items are correctly drafts. The stale pages were real prod classes, not dev leakage.

**Next steps**: recurring offerings still share a `<title>` (e.g. two "Stained Glass - TryIt Class"); binding a short date into the template title would make every page unique. Also consider the same auto-expiry for MT sections/semesters, and `/about` has no JSON-LD at all.

---

**Date**: 2026-06-26
**Status**: Phase 4 complete; Phase 5 in progress. Spruce Room availability epic (#39) — PRs 1 & 2 shipped; adding the upcoming-schedule agenda (legacy #504).

### Spruce Room upcoming-schedule agenda (legacy #504, 2026-06-26)

The epic deferred a "check the calendar" view ("Add later only if missed"). It was missed — the portal could say if the room was free *right now* and warn on conflicts inline, but there was no way to see all upcoming usage to plan around. Added a read-only **agenda view** at `/room-schedule` (Calendar nav group + a "View schedule" link on the dashboard room widget): bookings over the next 2/4/8 weeks grouped by day, with consecutive free days collapsed into an "Open" range.

Pure additive UI on top of the existing `getRoomSchedule` callable — **no backend or Firestore index changes**:
- `groupRoomScheduleByDay` domain helper (`libs/ts/domain/room.ts`) + unit tests
- `useRoomScheduleRange(room, start, end)` hook (`libs/react/rooms`) — generalizes `useRoomScheduleForDate` to an arbitrary span
- `RoomScheduleAgenda` / `RoomScheduleAgendaList` components (`libs/react/rooms`) + tests

### Spruce Room availability — PR 1 shipped (2026-06-11)

The Spruce Room is going multi-tenant (music lessons, Music Together, ad hoc uses); David/Katie/Nathan need to know if it's free. Epic #39 holds the product decisions and architecture; the portal is the source of truth for room occupancy.

PR 1 (legacy #468 / legacy PR #470): `room` field on CalendarEvent/Class, `onLessonWrite` trigger deriving private room-blocking events from scheduled lessons (closing the gap where lessons were invisible to the calendar aggregation), `getRoomSchedule` admin callable + composite index, and the dashboard "Spruce Room right now" widget.

**Next steps**:
- PR 2 (legacy #469): ad hoc "Book the Spruce Room" form, day strip + warn-and-confirm conflict warnings in ScheduleLessonDialog / class form / event form
- Ops: onboard Nathan (add him in Firebase Console → Authentication, he sets a password via Forgot password, grant admin from `/users`) — decided full admin is fine

### Timekeeping retired — replaced by Square (2026-05-09)

### Timekeeping retired — replaced by Square (2026-05-09)

Square Payroll trial in place; hours will flow from Square Shifts (clock-in via the Square POS app on iPad). Square owns hours, rates, and payroll end-to-end. The custom `/timesheet` and `/employees` pages plus the 8 time-entry/employee Cloud Functions, `Role.Employee`, `EmployeeGuard`, and the timesheet components lib were deleted. No data was in production yet — Nathan never saw the page.

### Admin User Management — Shipped (2026-05-08)

Admin `/users` page where Katie/David can see everyone who's signed up to the admin app and grant or revoke admin access.

- 3 Cloud Functions: `listUsers` (Firebase Admin SDK + admin record join), `grantAdminRole`, `revokeAdminRole`
- Self-protection: admins cannot revoke their own admin role (would lock themselves out)
- `AppUser` domain type (Firebase Auth user + isAdmin)
- Components lib: `libs/react/users/` (`UserList`, `UserRolesDialog`)
- Nav: "Users" under Admin group

### Phase 4 Music Lessons — Complete

Branch: `feature/283-teacher-payouts` (legacy PR #304)

All 6 sub-issues of legacy epic #10 implemented:
- legacy #278 Student records + admin UI
- legacy #279 Lesson scheduling + recurring series
- legacy #280 Private-pay invoice initiation
- legacy #281 Square invoice delivery + webhook payment attribution
- legacy #282 Hope Scholarship handling (rates, rendered-lesson tracking, invoice guard)
- legacy #283 Teacher payout tracking (aggregation from both sources, substitute attribution)

**Requirements reviewed and updated** — REQUIREMENTS.md Phase 4 section rewritten to match actual implementation. Deferred items documented (lesson packages, teacher availability, public profiles).

### Phase 5: Unified Inventory, Etsy Push, & Sales Tracking

**Planning completed 2026-04-19.** Admin app is single source of truth for products, pushing to Etsy + Square. Sales on either channel auto-record with cross-channel inventory sync.

**Etsy API approved** (2026-03-27, `maplspruce-listings` app, Personal Access tier).

8 of 9 PRs merged 2026-04-19 → 2026-04-22. Picking up the remaining admin UI work (legacy #312) on 2026-05-08, split into two reviewable PRs.

| PR | Issue | Title | Status |
|----|-------|-------|--------|
| 1 | legacy #305 | Product variant model refactor | Merged (legacy #314) |
| 2 | legacy #306 | Square multi-variation catalog support | Merged (legacy #318) |
| 3 | legacy #307 | Push-to-Etsy Cloud Function | Merged (legacy #319) |
| 4 | legacy #308 | Etsy import multi-variant support | Merged (legacy #322) |
| 5 | legacy #309 | Sale recording + InventoryMovement audit log | Merged (legacy #317) |
| 6 | legacy #310 | Etsy order polling + cross-channel inventory sync | Merged (legacy #324) |
| 7 | legacy #311 | Etsy sync conflict detection + resolution | Merged (legacy #325) |
| 8a | legacy #312 | Admin UI — variants in ProductForm + DataTable | Merged (legacy #402) |
| 8b | legacy #312 | Admin UI — `/sales` page + Push-to-Etsy button | **In progress** (this PR) |
| 9 | legacy #313 | Artist payout calculation + admin page | Merged (legacy #321) |

**Full plan:** `.claude/plans/wild-scribbling-stearns.md`

### Image2Pages Webflow Widget (in flight)

Branch: `feat/image2pages-widget`

- New Webflow Code Component at `apps/webflow-components/src/Image2PagesWidget.tsx` + `image2pages.webflow.tsx`
- Pure-browser tiling library at `apps/webflow-components/src/lib/image2pages-tile.ts` (Canvas + pdf-lib, no server)
- Three sizing modes: by page count, target width (in), target height (in)
- Live preview canvas with dashed dark-brown page-boundary overlay; brand-themed via `@maple/react/theme`
- Tests: `apps/webflow-components/src/lib/image2pages-tile.spec.ts` (16 unit tests for `bestGrid` / `gridFromTargetSize` / `computeLayout`)
- Nx scaffolding added: `apps/webflow-components/project.json` + `vitest.config.ts` (test target only — no build target; webflow-cli still drives bundling via `webflow.json`)
- Published to workspace via `webflow library share` (env var aliasing: `WEBFLOW_TOKEN` → `WEBFLOW_WORKSPACE_API_TOKEN`)
- Embedded on new "Pattern Scaling Tool" page (page id `69d7921b12449f27596c57e9`, draft) with maple-nav + Image to Pages + Footer
- PR: legacy #231
- Ported from standalone prototype: github.com/david-shortman/image2pages-web

### Registration Launch: Meta Ads Readiness

Goal: enable paid Meta ads driving traffic to Webflow class registration pages.

### What's Done

**Wave 1 code (all merged):**
- legacy PR #213 — Class roster admin page (legacy #211)
- legacy PR #214 — Email templates for confirmation + cancellation (legacy #197)
- legacy PR #216 — syncRegistrationCount Cloud Function (legacy #143)
- legacy PR #217 — Integration tests for syncClassToWebflow (legacy #206)
- legacy PR #218 — Integration test foundation with 8 domain-specific projects (legacy #167)
- legacy PR #226 — Square receipt URL in registrations + emails (legacy #192) — auto-merge pending

**Registration flow verified:**
- Registration widget placed on Webflow CMS class detail page
- Props bound to CMS fields (firebase-id → classId)
- Tested working end-to-end with dev Square configuration

**Analysis completed:**
- legacy #205 sync fields already implemented — remaining work is Webflow Designer binding
- legacy #202 component already placed — just needed manual prop configuration (done)

### Remaining Work (Manual Ops)

| Task | Issue | Owner | Notes |
|------|-------|-------|-------|
| AWS account + SES setup | legacy #223 | David | **Start first** — production access takes 24-48h |
| Firebase email extension | legacy #195 | David | After SES; then run `tools/seed-email-templates.ts` |
| GA4 + GTM | legacy #116 | David | Google/Webflow console work |
| Meta Pixel | legacy #224 | David | After GTM; needed for ad optimization |
| Privacy + cancellation policy pages | legacy #225 | David/Katie | Webflow content pages |
| Canonical domain + sitemap | legacy #120 | David | DNS + Webflow settings |
| Switch widget to prod Square credentials | — | David | Webflow Designer, last step |
| Upcoming Classes page enhancements | legacy #210 | In progress | Agent working on Webflow MCP |

### Issues Created This Session

| Issue | Title |
|-------|-------|
| #22 | Admin email template management with preview |
| #25 | Configure required status checks for PR merging |
| legacy #223 | Create AWS account + SES for Maple & Spruce |
| legacy #224 | Install Meta Pixel via GTM |
| legacy #225 | Privacy policy + cancellation policy pages |

### Key Decisions Made

- **Handlebars templates** for emails (matches existing `createRegistration` code pattern, easier to update than inline HTML)
- **Agent Teams** enabled for parallel development (experimental feature)
- **Per-domain integration test apps** structure from legacy #218 (artist, class, instructor, etc.)
- **vitest.config.ts** excludes integration test apps from unit test runner

### Blockers
- SES production access approval (24-48h) blocks email testing
- No blockers for registration flow itself — working on dev

---

## Quick Reference

### Environments
| Environment | Web App | Firebase Project | Square |
|-------------|---------|------------------|--------|
| Production | business.mapleandsprucefolkarts.com | `maple-and-spruce` | Production API |
| Development | business-dev.mapleandsprucefolkarts.com | `maple-and-spruce-dev` | Sandbox API |
| Webflow (public) | mapleandsprucefolkarts.com | Both (via `env` prop) | Both (via `squareAppId` prop) |

### Webflow CMS
| Collection | ID | Fields |
|------------|-----|--------|
| Artists | `696f08a32a1eb691801f17ad` | Existing |
| Classes | `69d0fb7572d9e153c22ce489` | 19 fields incl firebase-id, display fields |

### Webflow Component Publishing
```bash
npx webflow library share --manifest apps/webflow-components/webflow.json --skip-update-check
```

### Test Commands
```bash
npm test
npx vitest run --config libs/firebase/webflow/vitest.config.ts
npx nx run domain:test
./tools/validate-function-tsconfigs.sh
```

### Deployment
**Let CI/CD handle deployments** - don't run manual `firebase deploy` commands.

---

## Session History

See `history/` folder for detailed session logs:
- [2026-02-03](history/2026-02-03.md) - Phase 3c: Registration system, security fixes, Next.js 16
- [2026-01-25](history/2026-01-25.md) - Sync conflict resolution, Storybook test fixes, Phase 3a/3b
- [2026-01-20](history/2026-01-20.md) - Webflow CMS sync, dev/prod separation
- [2026-01-19](history/2026-01-19.md) - Dev environment fixes, product/artist integration
- [2026-01-18](history/2026-01-18.md) - Square integration foundation, dev/prod separation

---

*Last updated: 2026-04-05*

## #81 PR 1 — lesson billing rules + the charge job (backend)

Named `LessonBillingRule`s ("every 4 lessons, charged the day before the first"),
planned `LessonScheduledCharge` documents, and a daily job that takes the ones
that are due against the family's card on file. Reuses the Music Together
installment pattern rather than inventing a second charging mechanism.

**Card capture stays in person.** Katie and Nathan save the card in Square at the
studio; the portal links to that card. The original #81 scope line said web
capture would *replace* the manual step — that is wrong and is corrected here.
`Student` now carries `squareCustomerId` / `squareCardId` / `cardBrand` /
`cardLast4` / `cardLinkedAt`, and `docToStudent` maps them.

Next (PR 2): `listStudentSquareCards` / `linkStudentSquareCard`, the payment-method
card on `/students/[id]`, the rule editor, and the upcoming-charges view with
skip/waive.

## legacy #835 PR 1 — derive and extend lesson blocks from scheduling (backend)

Katie no longer has to build a `LessonBlock` by hand before she can schedule
into it. A caller may pass a `blockStrategy` asking for a block to be derived
from what is being scheduled, or for a nearby one to be widened.

The rule that keeps this honest: **a derived block claims exactly what its
source claims.** A standing weekly arrangement yields a recurring block; a
single lesson yields one scoped to that date (`LessonBlock.onDate`). A block is
what `get-my-week` reads as standing availability, so a makeup lesson minting a
weekly block would be a lie about when the teacher works.

Widening a recurring block is Admin-only and never a default — it changes that
weekday for every future lesson.

Next (PR 2): `ScheduleLessonDialog` and the standing-arrangement dialog surface
the choices, with Storybook `play` coverage.

## legacy #837 — biweekly standing arrangements

`StudentLessonSchedule` gains `intervalWeeks`. Katie had been expressing "every
other Tuesday" by hand-creating a lesson on each off-week and cancelling it, so
the materialiser would skip that date — roughly 26 cancellations a year per
student, and it lapses silently the first week she is busy.

The load-bearing part is **parity**: which weeks belong to a student. Counted
from the first occurrence on or after `startsOn`, in shop-timezone calendar
days, so it survives a skipped week, a rescheduled lesson, the horizon rolling
forward, and both DST changes. Two students alternate in one Tuesday hour, so
a pattern that drifted a week would put two families in the room together.

`tools/backfill-schedule-cadence.ts` migrates existing arrangements and refuses
to write when the proposed parity does not match the student's real lessons.

## Repository mapper ratchet + four live gaps it found

`tools/check-repository-mappers.ts` fails CI when a domain entity declares a
field its `docToX` mapper does not read back. That mistake is silent in every
way that normally catches one: it compiles, unit tests pass (they hand-build
entities and never touch the mapper), and the value writes to Firestore fine.

It shipped three times (#81 card fields, legacy #835 onDate, legacy #837 intervalWeeks) and
found four more the first time it ran — most consequentially
`Artist.preventAutoPublish`, where the "don't auto-publish" checkbox read back
unticked and the next save silently re-enabled publishing.

## legacy #838 — the day column

`/teaching-days` shows one day top to bottom in time order, with **open slots
in the sequence** between the students — the shape of the spreadsheet Katie has
been keeping by hand.

The part no existing view could express: an opening has a cadence. "Open every
other week" is the alternate week of a biweekly student's hour and fits exactly
one more biweekly student, while an hour holding two interleaved biweekly
students (two students sharing Tuesday 5pm) is not free at all. A busy/free
view cannot tell those apart.

Composed client-side from existing reads, so no new Cloud Function.

Also fixes `getStudentLessonSchedules`, which scoped by the caller's linked
instructor record without checking for admin — so "all teachers" would have
shown Katie only her own students.

## #81 — linking a card Katie already saved in Square

Katie saves cards in the Square app, in person. The portal now finds the card
she already saved and attaches it to the right student, rather than asking the
family to enter it again.

`rankCardsForStudent` suggests matches. Email is the primary signal because it
is the only field that bridges both real shapes: an adult student's card is in
their own name, but a child's is in a parent's — sharing no part of the child's
name — and the bridge is that the child's contact email is the parent's.
Verified against the live account before building.

Nothing links automatically; a wrong link charges the wrong family.

## #81 — the payment method card on the student page

`/students/[id]` now shows the card on file and, when there is none, the cards
in Square that match this student, each with its reason. Katie saves the card
in the Square app; this attaches it.

Suggestions come from `rankCardsForStudent`, the same pure function the server
uses to validate the choice. Nothing links automatically.

Hidden for Hope students, who bill through the EMA portal.

## #81 — visibility and control over automatic charges

New `/lesson-billing` page and a per-student section showing what the daily job
is about to take, with Cancel and Waive on anything still scheduled.

Deliberately built **before** any UI that creates a billing rule. The job plans
and takes charges unattended, so the only thing between a wrong rule and a
wrong charge is that somebody saw it coming.

Prod state at the time of writing: 0 billing rules, 0 charges, 0 linked cards —
so nothing charges anyone today, and nothing will until a rule exists.

## #87 — Material React Table trial on /students

Column pinning is a paid MUI X Pro feature (verified in v7, v8 and v9), so
`/students` now uses Material React Table (MIT) instead: Student and Lesson
Day / Time pinned left, Actions pinned right.

Also delivers #86's default sort by time slot, since `weekdaySortKey` already
existed and already groups no-slot students last.

One integration cost found by looking at it rather than by testing: MRT ships
pinned cells at `opacity: 0.97`, so the scrolling columns read through as ghost
text. Forced opaque, with a play test pinning it.

Decision still open: keep and spread, keep and contain, or revert (see #87).

## legacy #835 — no block covers this time: offer a way through

Picking a time nothing covered used to be a dead end. The dialog said the
lesson did not fit, and Katie had to leave, widen the block on the Lesson
Blocks page, and come back. A 6:00–6:30 slot is exactly that: the Tuesday
block ends at 6:00.

`BlockAttributionChoice` now offers the widening or the new block that would
fit, computed by `planBlockAttribution` — the same pure function the server
uses to validate the choice, so the dialog cannot offer something the server
would refuse. Nothing is applied automatically; widening a recurring block
changes that weekday for every future lesson, and it says so.

Completes the UI half of legacy #835, whose backend shipped in legacy #836 and had been
unused since.

## legacy #841 — two things cannot be in the room at once

Nothing enforced this. Lessons, Music Together classes and private rentals
could all be booked into the same hour. The only guard that existed is keyed
`studentId|instant`, so it stopped a student clashing with themselves and was
blind to two different people wanting the same room.

The check reads `CalendarEvent`, which is already the room-occupancy model:
`onLessonWrite` upserts one per lesson, the room-booking page creates them for
rentals and Music Together, and a cancelled lesson has its event removed. So
one check covers every way the room gets used.

Interactive writes refuse. Materialisation, which runs unattended, skips the
occurrence and counts it — throwing would abandon every remaining arrangement.
