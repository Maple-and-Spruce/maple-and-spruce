# Lesson Billing: Manual Test Plan (dev, Claude in Chrome)

> A runbook for Claude to drive the private-pay music lesson billing features end to end in
> the **dev** environment through Claude in Chrome, and record what it saw. It complements,
> and does not replace, the automated layers: `lesson-billing.spec.ts`,
> `charge-lessons-now.spec.ts`, `link-student-card.spec.ts` (integration),
> `student-page.spec.ts` (portal e2e, emulators only) and the Storybook play tests for
> `PaymentMethodCard`, `PrepayLessonsCard`, `UpcomingChargesCard` and `BillingTable`.
>
> What only this plan covers: the **deployed** dev functions (the legacy #872 class of bug, where
> `chargeLessonsNow` was never deployed and Pay ahead failed with `functions/not-found`), the
> **real Square sandbox** instead of the mock server, the real scheduled job, and the
> Square invoice webhook.

---

## 0. Ground rules

- **Dev only.** App: `https://business-dev.mapleandsprucefolkarts.com`. Firebase project:
  `maple-and-spruce-dev` (region `us-east4`). Square: **sandbox** (dev's `SQUARE_ENV` is not
  `PROD`). Before any step that charges a card, confirm the URL bar says `business-dev`.
  Stop immediately if anything points at prod.
- **Invented people only** (`.claude/rules/customer-privacy.md`). Every student, contact and
  Square sandbox customer made for this run uses the names below and `@example.com` emails.
  Dev may hold other rows; do not copy their names into the results log or any issue. Refer
  to them by document id if you must.
- **Sign-in** is email + password. Use the 1Password `request_credentials` flow for the dev
  portal admin account. Never type a password yourself.
- **No money moves.** Sandbox charges are fake, but still ask David in chat before the first
  charge of a run, per the browser safety rules. One approval covers the charging steps of
  this plan in that run.
- **Record as you go.** Each step has an id (`LB-…`). Log `PASS` / `FAIL` / `BLOCKED` with a
  one-line note and, for a FAIL, a screenshot and the console / network error. Template in §12.
- **The billing job runs every day at 09:00 America/New_York in dev as well.** Anything left
  `Scheduled` and due for a test student with a card will be charged by it. Clean up (§11) at
  the end of every run.

### Test data (invent, do not reuse real rows)

| Handle | Student | Contact / email | Setup |
|---|---|---|---|
| **A** | Robin Ashfield (adult) | `robin.ashfield@example.com` | card on file, weekly, on the test rule |
| **B** | Testchild Placeholder (child) | parent "Testparent Placeholder", `parent.placeholder@example.com` | card on file, **biweekly**, Pay ahead + failure paths |
| **C** | Test Nocard | `test.nocard@example.com` | no card anywhere |
| **D** | Test Hope | `test.hope@example.com` | Hope Scholarship on |
| **E** | Test Autoinvoice | `test.autoinvoice@example.com` | auto-invoice on, card on file, on the test rule |

Phones, if a form wants one: `304-555-0101` … `304-555-0105`.

---

## 1. Sign-ins and sandbox customers

Everything here is done by Claude in Chrome. The only thing David may need to do is sign in.

1. **Portal:** use the existing 1Password entry for the **dev portal admin** through
   `request_credentials` / `autofill_credential`. If autofill fails, ask David to sign in in
   the Chrome tab.
2. **Square Developer Console** (`developer.squareup.com`): ask David to sign in, or use a
   1Password item for it if one exists. Then open the **Sandbox** test account's seller
   dashboard (Sandbox test accounts → the Maple & Spruce sandbox account → **Open in Square
   Dashboard**). Confirm the page says it is a sandbox before going further.
3. **Create the sandbox customers** (Customers → Create customer) for A, B (in the parent's
   name, Testparent Placeholder) and E, using the emails in the test-data table and the `304-555-01xx`
   phones. Skip a customer that already exists from an earlier run.
4. **Save a card on file** for each (customer → Cards on file → Add card): Square's published
   sandbox test card `4111 1111 1111 1111`, any future expiry, CVV `111`, ZIP `26505`. For B
   also save the sandbox decline card `4000 0000 0000 0002`. These are Square's public test
   numbers, not anyone's card; never enter any other card number. If the sandbox refuses to
   save the decline card, §6's failure steps are `BLOCKED` and the integration spec remains
   their only cover.
5. **Firebase console and Cloud Scheduler** for `maple-and-spruce-dev` must be reachable in
   the same Chrome profile (needed for §7: no screen creates a billing rule or runs the job).
   If Google asks for a sign-in, ask David.

**Out of scope for now:** the lesson-teacher role (§10). There is no dev teacher account in
1Password yet.

---

## 2. Setup (Claude, start of each run)

| Id | Step | Expected |
|---|---|---|
| LB-S1 | Sign in to dev as admin. | Lands on the portal; "Music Lessons" nav shows Lesson Billing, Students, My Day. |
| LB-S2 | `/settings` → "Lesson Rates (private-pay)". Note current values; set 30 min (full) = **$30**, 45 min = **$45**, 60 min = **$60** if unset. Save. | "Saving…" then values persist on reload. |
| LB-S3 | Create students A–E (Students → new). D: tick "Hope Scholarship (WV)". E: switch "Automatically invoice after each lesson is taught" on. Leave "Lesson rate override ($)" blank for all except A = **$35**. | Each opens at `/students/{id}`; note the ids in the log. |
| LB-S4 | Standing schedules: A weekly, B **Every other week**, C/D/E weekly, 30 or 45 min, starting this week. | Confirmation line reads e.g. "Every other {Weekday} at …"; the Lessons table fills ~12 weeks ahead (B: ~6 lessons). |
| LB-S5 | For A and E, add a **one-off lesson earlier today** (Schedule lessons) so "Mark taught" is available. | Lesson shows `scheduled` with a **Mark taught** button. |
| LB-S6 | Snapshot `/lesson-billing` before any rule exists **for the test students** (see §7). | Record which banner shows. |

---

## 3. `/lesson-billing` overview (admin)

| Id | Step | Expected |
|---|---|---|
| LB-1.1 | Open `/lesson-billing`. | Heading "Lesson Billing"; subtext begins "Charges are planned ahead of the lessons they pay for…". |
| LB-1.2 | If dev has no `lessonBillingRules` documents. | Info alert "No billing rules exist yet, so **nothing is charged automatically**…". |
| LB-1.3 | Cardless warning. | "…active private-pay student(s) … no card on file…" lists **C**, not D (Hope) and not A/B/E once cards are linked (§4). |
| LB-1.4 | Before §7 runs. | "Automatic charges" card shows "Nothing is scheduled to be charged…". |
| LB-1.5 | Console / network. | No errors; `getLessonBilling` returns 200. |

---

## 4. Payment method: link / unlink a Square card (`/students/{id}`)

| Id | Step | Expected |
|---|---|---|
| LB-2.1 | Open C. | "Payment method" card: "No card on file, so nothing is charged automatically. Save the card in the Square app, then link it here." Pay ahead shows "There is no card on file yet…" and **Charge** is disabled. |
| LB-2.2 | On C, click "Show every card on file". | Full list; A/B/E sandbox cards appear (not yet linked). Toggle back with "Show suggestions". C's suggestions: "No card in Square matches this student's contact details…". **Link nothing.** |
| LB-2.3 | Open A. | Suggestion for the sandbox Visa with reason "Same email as this student's contact (robin.ashfield@example.com)" and a **Likely** chip. |
| LB-2.4 | Click **Link** on A's suggestion. | Card now reads "Visa ••1111", chip "On file", **Unlink** button, and "Lessons are charged to this card…". Survives reload. |
| LB-2.5 | Open B (child). | Suggestion from the parent's customer, reasons include the contact email (and "Same surname as …" if the cardholder name is set). Link the **4111** card. |
| LB-2.6 | Link E's card. | As LB-2.4. |
| LB-2.7 | On C, "Show every card on file". | A/B/E's cards are now **hidden** (already linked). |
| LB-2.8 | Guard: already linked. At LB-2.2, open C in a **second tab** too and leave it untouched on "Show every card on file"; it still lists B's card because it loaded before LB-2.5. Click **Link** on B's card there. | Server refuses: "That card is already linked to {B's name}. Unlink it there first." C stays unlinked. |
| LB-2.9 | Unlink on A, then relink. | Unlink returns to the "No card on file" state; the card remains in Square (still offered). Relink works. |
| LB-2.10 | Open D (Hope). | No Payment method card, no Pay ahead card; Billing section reads "Hope Scholarship students are invoiced through the EMA portal, so nothing is billed here." |

---

## 5. Pay ahead (`chargeLessonsNow`)

*Ask David for the one-time charge approval before LB-3.4.*

| Id | Step | Expected |
|---|---|---|
| LB-3.1 | On A, Pay ahead card. | Title "Pay ahead"; "Lessons to cover" defaults to "Next 4 lessons"; "This covers" lists 4 dates in New York time; button "Charge $140.00 now" (4 × $35 override) and chip "4 lessons". |
| LB-3.2 | Change to "Next 1 lesson", then "Next 8 lessons". | Amount and date list update ($35, $280). |
| LB-3.3 | "Choose lessons instead": tick 2 non-adjacent lessons; type "Test block" in "Note (optional)". | Heading "Choose the lessons"; checkboxes show date and price; button "Charge $70.00 now". |
| LB-3.4 | Click **Charge**. | Dialog "Charge $70.00 now?" listing the 2 dates, with the "Paying ahead is a commitment on both sides…" warning; buttons "Back" / "Charge $70.00". Confirm. |
| LB-3.5 | After the charge. | Billing table gains a **Manual charge** row, one amount $70.00, "Covers" 2 lessons with their date span, status **Paid**. Those 2 lessons are no longer offered in Pay ahead. Network: `chargeLessonsNow` 200 (not `functions/not-found`). |
| LB-3.6 | Square sandbox dashboard → Transactions. | One $70.00 payment on the Visa, note "2 music lessons — Test block". |
| LB-3.7 | **Double-click guard.** Pick 1 lesson, open the dialog, double-click "Charge $35.00" quickly. | Exactly one charge row and one sandbox payment. |
| LB-3.8 | **Stale amount.** Leave A's page open with a 1-lesson plan. In another tab change A's "Lesson rate override ($)" to $40. Back in tab 1, charge. | Refused: "Those lessons now come to $40.00, not the amount shown. Reload and check before charging." Nothing charged. Reset override to $35. |
| LB-3.9 | **Stale selection.** Two tabs on A, same first lesson selected; charge in tab 1, then tab 2. | Tab 2 refused ("…already covered by another charge. Reload and pick again." or "That charge is already being taken. Reload…"). One payment only. |
| LB-3.10 | On B (biweekly) choose "Next 12 lessons". | Only the lessons that exist (~6) are listed; amount matches that count. Do **not** charge. |
| LB-3.11 | Open E in two tabs. In tab 2 set E to **Inactive**. In tab 1 (stale), Pay ahead 1 lesson. | "This student is not billed here… inactive students are not charged." Reactivate E. |
| LB-3.12 | Evening boundary (only if the run is after 20:00 EDT / 19:00 EST). Pay ahead for a lesson dated earlier **today**. | Suspected bug: server may refuse as "already covered" because its "today" is UTC. Record the actual result either way. |

---

## 6. Failed charge and retry

| Id | Step | Expected |
|---|---|---|
| LB-4.1 | On B, Unlink the 4111 card and link the **declining** sandbox card. Pay ahead 1 lesson. | Error on both the Pay ahead card and the Billing table: "The card was declined: …". Billing row: **Manual charge**, **Failed**, error caption; the failed-charge alert "1 charge failed, totalling $X…". |
| LB-4.2 | `/lesson-billing`. | "Failed" group shows the charge with its error; **no** Try again here (by design). |
| LB-4.3 | Back on B: relink the 4111 card, click **Try again** on the failed row. | Row becomes **Paid** at the same amount and lessons; the sandbox shows one successful payment (and the earlier decline). |
| LB-4.4 | **Overlap risk (suspected bug).** Create another failed charge on B covering lessons L1+L2 (decline card). Then, with the good card, Pay ahead starting at **L2** (so a different first lesson), then Try again on the failed one. | If the failed charge's retry succeeds, L2 has been paid twice. Record exactly what happened; a double payment is a FAIL worth an issue. |

---

## 7. Automatic charges: rule + scheduled job

No screen creates a rule or runs the job, so this section uses the Firebase console and
Cloud Scheduler in Chrome, on **`maple-and-spruce-dev`** only.

| Id | Step | Expected |
|---|---|---|
| LB-5.1 | Firestore → `lessonBillingRules` → add doc `test-rule-4-before`: `name: "Test: 4 lessons, day before"`, `cadence: "every-n-lessons"`, `lessonsPerCharge: 4`, `anchor: "before-first"`, `anchorOffsetDays: -1`, `isDefault: false`, `archived: false`. **Not default**, so real dev students are unaffected. | Doc saved. |
| LB-5.2 | Set `billingRuleId: "test-rule-4-before"` on students A, C and E (Firestore, `students/{id}`). | — |
| LB-5.3 | Run the job. Preferred: dry run first by calling `triggerLessonBilling` with `{ dryRun: true }` from the signed-in portal tab (callable over fetch, ID token from the page's Firebase auth, never printed). Fallback: Cloud Scheduler → the `runLessonBilling` job → **Force run** (real run). | Dry run returns counts (`studentsConsidered`, `chargesPlanned`, `skippedNoCard`, …) and writes nothing. |
| LB-5.4 | Real run (Force run, or `dryRun: false`). | `/lesson-billing` "Automatic charges": blocks of 4 for A and E grouped in **Due now** (block starting today/tomorrow) and **Upcoming**; partial trailing block not planned; A's lessons already paid in §5 are **not** in any block. C has planned charges but they sit unpaid (`skippedNoCard`). |
| LB-5.5 | Row format. | "$X · {student} · 4 lessons · due {Mon D, YYYY}"; scheduled rows show **Waive** / **Cancel**. |
| LB-5.6 | Due block for A. | After the real run it is **Paid** (the job charges due blocks in the same run); sandbox shows a payment with note "Music lessons". A's Billing table shows an **Automatic charge** row. |
| LB-5.7 | Run the job again. | Idempotent: no new charges for already covered lessons (`chargesAlreadyPlanned` / `lessonsAlreadyCovered` go up, `charged` 0). No second sandbox payment. |
| LB-5.8 | Due time sanity. Pick an upcoming block whose first lesson is at e.g. 16:00. | "due" date is the day before. Note: with a 09:00 job the charge is actually taken the **morning of** the lesson (suspected surprise, record it). |

---

## 8. Stopping a charge: Waive and Cancel

| Id | Step | Expected |
|---|---|---|
| LB-6.1 | `/lesson-billing` → an Upcoming charge of E → **Waive**. | Dialog "Waive this charge"; "Waive $X" disabled until "Reason" has text. Enter "Makeup for a lesson we cancelled" → confirm. Row moves to **Settled** with chip "Waived" and the reason. |
| LB-6.2 | Another Upcoming charge → **Cancel**. | Row → Settled, "Cancelled". |
| LB-6.3 | Same actions from the student page Billing table (aria "Waive charge" / "Cancel charge"). | Same outcome; row hidden until "Show paid & closed" is on. |
| LB-6.4 | Re-run the job. | Waived/cancelled lessons are **not** re-planned (they count as covered). They are also not offered in Pay ahead. |
| LB-6.5 | Stale stop: page open on a scheduled charge, then run the job so it gets charged, then click Cancel in the stale page. | "This charge is already paid" (or "…taken while you were looking at it — reload…"). |

---

## 9. Lessons, invoices and auto-invoice

| Id | Step | Expected |
|---|---|---|
| LB-7.1 | On E, today's one-off lesson → **Mark taught**. | "Marking…" then chip "taught". Within ~1 min a Billing **Invoice** row appears, status `sent`, line "{n}-min lesson on {date}", note "Auto-invoiced when the lesson was marked rendered." |
| LB-7.2 | **Double billing check (suspected bug).** E is on the test rule with a card; if today's lesson is in a planned or paid automatic charge, E now has both an invoice and a card charge for it. | Record whether both exist. Both = FAIL; file an issue (no customer data). |
| LB-7.3 | On a past scheduled lesson of A: ⋮ → "Nobody came (no-show)". | Chip "no-show"; A (auto-invoice off) gets no invoice. |
| LB-7.4 | ⋮ → "Cancel lesson" on a lesson inside a planned charge. | Dialog "Cancel this lesson?"; lesson becomes `cancelled`. The planned charge keeps its amount and lesson count (known behaviour: fix by hand). Record it. |
| LB-7.5 | Manual invoice: on A, **New invoice** → "Add from lesson" → pick 1 → "Add selected"; add a line "Sheet music", Qty 1, Rate 12 → **Create draft**. | Row `draft`, correct total. |
| LB-7.6 | "Edit invoice" → change qty → "Save changes"; then "Send invoice". | Status `sent`; no "Square sync failed" chip after ~1 min. Sandbox dashboard shows the published invoice. |
| LB-7.7 | "Mark invoice paid" → "Paid via Venmo". | Status `paid`, chip "Paid via Venmo"; row hides until "Show paid & closed". |
| LB-7.8 | New draft → "Delete invoice" → "Delete this draft invoice?" → confirm. | Row gone. |
| LB-7.9 | Send another invoice → "Void invoice" → "Void this invoice?" → confirm. | `void`; Square invoice cancelled. |
| LB-7.10 | **Webhook.** Send an invoice, then pay it in the sandbox (invoice's public payment page with 4111). | Within a minute the row is `paid` with "Paid via Square". If it never flips, check that the dev sandbox webhook subscription points at dev `squareWebhook`; record as FAIL/BLOCKED accordingly. |
| LB-7.11 | `/my-day` as admin for E's taught lesson with a sent invoice. | "$X due" with "Record Venmo" / "Cash / check"; record Cash / check → "Paid $X · …". |
| LB-7.12 | Hope guard: D has no "New invoice" (no Billing table). | Confirmed by LB-2.10. |

---

## 10. Roles (lesson-teacher) — deferred

> Skipped until a dev lesson-teacher account exists in 1Password. Log these as `SKIPPED`.

Sign out, sign in as the dev lesson-teacher (1Password).

| Id | Step | Expected |
|---|---|---|
| LB-8.1 | Nav. | No "Lesson Billing", "Hope Billing", "Teacher Payouts". |
| LB-8.2 | Type `/lesson-billing` in the URL bar. | Access denied / redirected; no billing data rendered. |
| LB-8.3 | `/students/{B}`. | Page loads. Record how the admin-only parts fail: Payment method card error, "Failed to load charges: …". A teacher seeing raw permission errors is a UX FAIL worth noting, not a security FAIL. |
| LB-8.4 | `/my-day`: Mark taught / No-show and "Record Venmo" on the teacher's own lesson. | Work. |
| LB-8.5 | Try "Charge" / "Link" if visible. | Refused server-side; nothing charged. |

Sign back in as admin.

---

## 11. Cleanup (every run, even a failed one)

1. Waive or cancel every remaining **Scheduled** charge for A–E (so the 09:00 job takes
   nothing).
2. Firestore: set `archived: true` on `test-rule-4-before`, and remove `billingRuleId` from
   A, C, E.
3. Unlink cards on A, B, E; set A–E to **Inactive** (keeps history, drops them from the job
   and the cardless warning).
4. Restore `/settings` lesson rates to the values noted in LB-S2.
5. Leave sandbox payments alone (they are the record of the run).

---

## 12. Results log template

Write the log to the session scratchpad (not the repo), then summarise to David. File an
issue per FAIL, describing students by handle (A–E) or document id.

```markdown
# Lesson billing manual run — YYYY-MM-DD HH:MM ET
Env: business-dev / maple-and-spruce-dev / Square sandbox. Commit on main: <sha>
Test student ids: A=stu-… B=… C=… D=… E=…

| Id | Result | Note |
|----|--------|------|
| LB-S1 | PASS | |
| LB-3.5 | FAIL | chargeLessonsNow → functions/not-found (screenshot 03.png) |
| LB-4.1 | BLOCKED | sandbox would not save the decline card |

Suspected-bug checks: LB-3.12 …, LB-4.4 …, LB-5.8 …, LB-7.2 …, LB-7.4 …
Cleanup done: yes/no (what is left)
```

## Known gaps this plan does not cover

- Creating or editing billing rules has **no UI**; `saveLessonBillingRule` validation
  (±14-day offset, name required, flat amount > 0) is covered only by the integration suite.
- Card pagination past 25 cards needs more sandbox cards than a run should create.
- `triggerLessonBilling` has no button; §7 reaches it through the console or a fetch.
