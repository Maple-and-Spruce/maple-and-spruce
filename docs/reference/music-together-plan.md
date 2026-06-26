# Music Together — Findings Report & Implementation Plan

> Status: **Planning** · Epic: [#508](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/508) · Phases: #510–#517
> Last updated: 2026-06-26

**Music Together (MT)** is a licensed early-childhood music program run at Maple & Spruce but operated as a **separate business** (Stephanie's single-member LLC) with its **own Square account and checking**. MT payments must route to MT's Square credentials, **not** M&S's. We treat the payment processor as **configurable per program**.

This document captures the codebase investigation behind the plan and the rationale for the key decisions. The actionable work lives in the GitHub issues; this is the durable "why".

> **Update 2026-06-26 (post-#509):** Craft Club Phase 2 (#509) landed a `CardsService.createCardOnFile` (`client.cards.create`) + `CustomersService.upsertByEmail` on the `Square` wrapper, with Square mock-server routes. **Card-on-file is therefore no longer net-new** — the original "Cards API entirely unused" finding below is superseded. Because these services hang off the wrapper's client, the Phase 0 multi-account work composes for free: `new Square(secrets, strings, MT_SQUARE_KEYS).cardsService` vaults to the MT account. `create-craft-club-subscription.ts:78-89` is the reuse template. **Phase 2 (#512) shrinks** to: confirm card-on-file + a stored-card charge against the MT account, plus `verifyBuyer` on the frontend if required.

---

## Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Week-5 installment mechanism | **Cards API `CreateCard` + Firebase `onSchedule` self-charge** | Fits existing infra; no Invoices Plus ($20/mo); full control over cancel/refund. |
| Overcharge safety | **3 layers**: stable Square idempotency key + Firestore status lease + cancel guard | Charge installment 2 **at most once**; failures are loud. |
| Failed Week-5 charge | **Email parent + flag in admin** (manual resolution) | No dunning exists; keep it simple and visible. |
| Tax | **Non-taxable** service (mirror lesson-invoice exemption) | MT is a service; outside city limits. |
| Export | **Per-session CSV** of (parent, child, child DOB) | Licensee report; no export util exists today. |
| Scheduling | **Firebase `onSchedule`**, not Vercel Cron | Repo already uses it; `vercel.json` has no crons. |

---

## Findings

### Stack reality check
This is a **Firebase Cloud Functions + Square + Webflow + Nx** app with a Next.js **admin** app. `vercel.json` only builds the admin app and has **no `crons`**; `main` deploys are disabled there. All scheduling is **Firebase Cloud Scheduler** (`onSchedule`). Public pages are **Webflow**; checkout is a **Webflow Code Component** calling Firebase callables.

### 1. Class booking + Square payment (today)
Synchronous **nonce-charge, no card stored, no webhook for completion**.

- Frontend: `apps/webflow-components/src/registration.webflow.tsx` → `RegistrationWidget.tsx` → `libs/react/registrations/src/lib/RegistrationCheckoutForm.tsx` → `SquareCardForm.tsx`. Web Payments SDK: `window.Square.payments(applicationId, locationId)` (`SquareCardForm.tsx:310`), `card.tokenize()` (`:367`) → single-use nonce. Card field is portaled out of Shadow DOM for Webflow.
- Backend: `calculateRegistrationCost` (maple-core, `apps/functions/src/index.ts:154`) for pricing; `createRegistration` (maple-square, `libs/firebase/maple-functions/create-registration/src/lib/create-registration.ts:195`) — validate → check open + agreements → **Firestore transaction reserves a `pending` reg + enforces capacity** (`:304-407`) → `OrdersService.createOrder` (`:417`) → `PaymentsService.createPayment` with `sourceId: nonce, autocomplete: true` (`:453`) → confirm + stamp `squarePaymentId/squareOrderId/squareReceiptUrl`. Refund via `cancelRegistration` → `PaymentsService.refundPayment`.
- Square wrapper: `libs/firebase/square/src/lib/square.utility.ts`, `class Square` instantiated **per-call** (not a singleton). **Cards API entirely unused.**

### 2. Admin portal
`apps/maple-spruce/` (Next.js 15 App Router + MUI), single `(admin)` route group. Auth: `AuthGuard` (sign-in) + `AdminGuard` (`libs/react/auth/src/lib/AdminGuard.tsx:164`, calls `checkAdminStatus`). Nav in `AppShellWrapper.tsx:50`. Existing: class CRUD (`(admin)/classes/page.tsx`), roster + inline refund (`classes/[classId]/roster`, `RegistrationDetailDialog.tsx:277`), registrations list, students/lessons/invoices (`students/[id]/page.tsx`). Data hooks in `libs/react/data/src/lib/use*.ts` call callables via `httpsCallable`. **No CSV/export utility exists.** Documented "add a managed entity" pattern: domain type → Vest → repository + index → CFs → data hook → UI lib → admin page → nav.

### 3. Data layer
Repositories: `libs/firebase/database/src/lib/*.repository.ts` (plain object literals, copy-and-adapt). `firestore.rules` is **deny-all** (Admin SDK only) — a new MT collection needs **no rules change** but **does** need composite indexes (`firestore.indexes.json`, CI-enforced by `tools/check-firestore-indexes.ts`).
- `Class` (`class.ts:44`): sessions inlined; capacity **whole-class only**; `spotsRemaining` computed on read.
- `Registration` (`registration.ts`): one doc/checkout; **no studentId** (email-keyed); payment denormalized on the doc.
- `Lesson` (`lesson.ts:26`): **recurring = N materialized docs sharing `seriesId`** (`LessonRepository.createSeries()`), no RRULE.
- `Invoice` (`invoice.ts:62`): only place a Square **customerId** is used; lessons treated **non-taxable** (`invoices.service.ts:160`).
- `ClassWaitlistEntry` (`class-waitlist.ts`): subcollection, **unordered, no reservation**.
- **No Family/Household/Customer entity** — parent contact is loose strings. MT's family/child/DOB shape is greenfield.

### 4. Multi-tenant Square
Favorable: the `Square` client is built **per-call from constructor args**, and every service method already takes `locationId` as a parameter. A second account = a **parallel secret/string set**. Hardcoded to one account today: `SQUARE_SECRET_NAMES`/`SQUARE_STRING_NAMES` literal tuples (`square.utility.ts:28,38,95,100`) and the single `SQUARE_WEBHOOK_SIGNATURE_KEY` (`square-webhook.ts:233`). Frontend app-id/location-id are **already props** (`SquareCardForm.tsx:129`, `registration.webflow.tsx:22`). Plan: a `squareNames(prefix)` factory + `MT_SQUARE_*` params + a separate `musicSquareWebhook` function with its own key (cleaner than multiplexing by `merchant_id`).

### 5. Scheduling infra
`onSchedule` is production-proven: `expireAgreementRequests` (`expire-agreement-requests.ts:13`), `sendClassReminders` (`send-class-reminders.ts:345`). The latter splits an `onSchedule` wrapper over a plain `runX(date)` plus an admin-callable `triggerX` — because `onSchedule` isn't emulator-reachable, the callable drives integration tests + manual catch-up. Reusable deferred-work pattern: webhook → Firestore → `onDocumentWritten` worker with a **claim-lease** (`process-catalog-sync-request.ts:230`). Idempotency keys are established (`payments.service.ts:211`). **No payment retry/dunning exists** — net-new.

### 6. Reuse vs. net-new

| Reuse | Net-new |
|---|---|
| `Square` wrapper, Orders/Payments services | **Cards API `CreateCard`** card-on-file |
| `SquareCardForm` / Web Payments SDK (props-driven) | **Second Square account** params + `squareNames(prefix)` factory |
| Webflow Code Component pattern | **`musicSquareWebhook`** + key |
| `onSchedule` + admin-trigger split | **Week-5 charge job** + failure handling |
| Repository / Vest / index / deny-all scaffolding | **MT collections** (sections, registrations, family/child/DOB) |
| Capacity-in-transaction reservation | **8-family cap + ordered waitlist** |
| Admin "managed entity" pattern; roster + inline refund | **Licensee CSV export** (no export util) |
| `mail`-collection emails | **Installment-2 receipt / failed-charge emails** |

### 7. Risks / open questions
- **Card-on-file is the critical path & untested here** — needs `verifyBuyer` (frontend) + `cards.create` (backend). De-risk in Phase 2 before checkout.
- **PCI / authorization copy** for storing a card for a future charge — confirm wording; store `cardOnFileAuthAt`.
- **Failed Week-5 policy** — chosen: email + admin manual (no silent retries).
- **Second sandbox** — David to create the MT Square account + a second sandbox (token/location/app-id/webhook key).

---

## Overcharge-safety design (Week-5 charge)

A registration is charged for installment 2 **at most once**, enforced at three layers:

1. **Stable idempotency key** `mt-installment2-{registrationId}` (no `Date.now()`). Square itself dedupes — a retry returns the original payment, never a new charge.
2. **Firestore status lease**: `installment2.status: scheduled → charging → paid | failed | cancelled`. The job only picks up `scheduled && dueAt <= now && paymentPlan === 'installments'`, and flips to `charging` before charging so overlapping runs can't double-process (claim-lease pattern from `process-catalog-sync-request.ts:230`).
3. **Card-on-file, not a nonce**, for charge #2 (no parent present). The nonce is used only at registration: take installment 1 + `verifyBuyer` to vault the card.
4. **Cancel guard**: `cancelMusicTogetherRegistration` always sets `installment2.status = 'cancelled'`, so the scheduler skips it — no separate timer to forget.
5. **Loud failure**: `failed` → parent email (`mail` collection) + "past due" admin flag. No silent retries.
6. **Testability**: `onSchedule` wrapper + admin-callable trigger + **dry-run** that lists what would be charged.

---

## Phased plan (sandbox-first)

| Phase | Issue | Summary |
|---|---|---|
| 0 | [#510](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/510) | Multi-account Square plumbing: `squareNames(prefix)`, `MT_SQUARE_*`, `musicSquareWebhook` |
| 1 | [#511](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/511) | MT data layer: sections + registrations (family/child/DOB), repositories, Vest, indexes |
| 2 | [#512](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/512) | Card-on-file proof of concept (sandbox): `verifyBuyer` → `cards.create` → stored-card charge |
| 3 | [#513](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/513) | Registration + checkout: Webflow widget, two payment options, 8-family cap |
| 4 | [#514](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/514) | Week-5 auto-charge `onSchedule` + dry-run + overcharge safety + failure + refund/cancel |
| 5 | [#515](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/515) | 8-family cap → ordered waitlist with availability capture |
| 6 | [#516](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/516) | Admin Music Together section + licensee CSV export |
| 7 | [#517](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/517) | Webflow pages + Music submenu + `musictogethermaplespruce.com` forward |

Earliest unknowns (do first): **Phase 0** (multi-account) and **Phase 2** (card-on-file PoC). Production MT credentials are swapped in only at Phase 7.

## Owner action items (David)
- Create the **MT Square account** + a **second Square sandbox** (separate access token, location ID, application ID, webhook signature key).
- Confirm card-on-file **authorization copy** before Phase 3.
