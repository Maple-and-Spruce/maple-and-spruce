# Suzuki lessons readiness — execution plan

> Standing plan for epic **#793**. Written so an agent can pick up the next slice and ship it
> without being orchestrated by hand. Read this, pick the next unblocked slice, do it, open the PR.

---

## What this epic is

Hope Scholarship and private-pay Suzuki lessons, ready to run end to end: a cold ad click becomes a
booked interview, Nathan and Katie are told what needs doing instead of going looking, and families
are billed without anyone initiating a charge by hand.

Phase 4 (Music Lessons) is marked complete in `docs/reference/REQUIREMENTS.md`. **It is not.** That
line was written against the admin CRUD surface, which does exist and works. The funnel in front of
it and the money behind it do not.

Full audit with evidence: https://claude.ai/code/artifact/2ca96438-5a39-4ee2-a6f9-b63e7bcb5080

---

## Slice board

Do them in order unless a slice says otherwise. Each is one PR.

| # | Issue | Slice | Status | Note |
|---|---|---|---|---|
| 1 | #794 | Suzuki intake form + Meta/GA4 attribution | **merged** (PR #803) | the 4 manual steps still outstanding |
| 2 | #795 | Persist lesson inquiries + `/leads` queue | **in review** (PR #808) | needs `TALLY_API_KEY` in Secret Manager |
| 3 | #805 | Lesson action UX: primary action + overflow menu + per-action progress | **merged** (PR #809) | `/leads` already follows this pattern |
| 4 | #796 | `no-show` lesson status + billing behaviour | **in review** | **unblocks #799** |
| 5 | #799 | Hope services-rendered tracking + submission queue + historical entry | **next** | the revenue |
| 6 | #807 | Needs Attention queue | ready | after #799, so it can carry the Hope row |
| 7 | #797 | Standing lesson schedules (recurring arrangement + exceptions) | ready | — |
| 8 | #798 | Card-on-file autopay + reusable billing rules | ready | easier after #797 |
| 9 | #804 | Hope EMA export + payouts at *paid* + editable rates | **blocked** | EMA format + backfill Qs |

**Order set 2026-09-04** from two answers: the Suzuki ad goes live in about two weeks, and among
everything else the unrecorded Hope revenue matters most.

**What the ad actually needs is #794, not #795.** Merging #794 and doing its four manual steps is what
makes the spend measurable; #795 is what stops leads rotting in an inbox once volume arrives. If the
ad has to go on before #795 lands, that is survivable — it is how the site works today — but do not
let it run long that way.

**The path to Hope revenue is #805 → #796 → #799.** #796 is the load-bearing one: without a `no-show`
status, a Hope lesson nobody attended has to be recorded as `cancelled` (losing the fact) or
`rendered` (and would be submitted to EMA as a service never rendered). #805 comes first only because
#796 adds a fourth action to a row of unlabeled icon buttons.

**Persistence is a scheduled poll, not a webhook** (settled in #795). The webhook path is one-shot
and unretryable, has to keep `maple-webhooks` tiny, and cannot backfill history. Analytics stays on
the webhook; anything that only has to be *right* rather than *instant* polls the Tally API instead.
The API shape is **not** the webhook shape — see the header comment on `map-submission.ts` before
touching any Tally ingestion.

**Nothing here gates starting.** Backdated lesson entry already works — no future-date constraint in
`lessonValidation`, no `disablePast` in the dialog — so Nathan's Hope lessons can be entered and
marked rendered by hand today, as long as a `LessonBlock` covers that weekday and time. Hope pays
backwards, so every one entered is claimable.

---

## Protocol for each slice

### Before writing code

1. `git fetch origin main`. **Local `main` and every sibling worktree can be far behind.** Verify
   what exists with `git show origin/main:<path>`, never with `ls` in a local checkout.
2. `git worktree add -b feature/{issue}-{slug} ../maple-and-spruce-worktrees/{issue}-{slug} origin/main`,
   then `pnpm install` **in the worktree** — a fresh worktree has no `node_modules` and every test
   command fails with `MODULE_NOT_FOUND` from `vitest.config.ts` until it does.
3. Read the issue in full. Read `.claude/rules/firebase-functions.md` and `.claude/rules/verification.md`.
4. Re-read the "Decisions already made" section below so you don't relitigate settled questions.

### While writing code

Follow the repo's own rules; the ones this epic keeps running into:

- **`maple-webhooks` stays tiny.** Tally hangs up at 10s and does **not** retry. Adding
  `firebase-admin`, repositories, the Square SDK or webflow-api to `apps/functions-webhooks`
  reintroduces a lost-lead outage for every webhook in it. ADR-031.
- **Prefer a route on a domain router over a new function** (ADR-029). If the count must move, move
  the baseline deliberately: `npx tsx tools/check-function-count.ts --fix`.
- **Declare every composite index in the same PR.** The emulator does not enforce them, so green
  integration tests prove nothing here: `npx tsx tools/check-firestore-indexes.ts`.
- **Every new callable declares a role**: `npx tsx tools/check-callable-roles.ts`.
- **Never double-charge.** Anything touching money reuses the scheduled-charge lease + stable
  idempotency key from `music-together-scheduled-charge.ts`. Never derive a key from a timestamp.
- **Copy style**: no em dashes ever (en dashes fine in ranges), bold sparingly.

### Before opening the PR

- Unit tests on everything new (~85% on new code).
- Integration tests for anything touching Firestore, Square, Webflow or payments.
- A Storybook `play` story for any React UI.
- **Look at it.** Storybook or the running app. A green suite is not evidence the thing works.
- Update `docs/sessions/SESSION.md`, and `docs/reference/deployed-functions.md` if a function was added.
- Tick the slice's box on #793 and update the board above.

### Stop and ask when

Anything on the "Needs David or Katie" list below is load-bearing for the slice you are on. Do not
guess a studio policy, a legal position, or an external system's file format. Everything else,
decide and record the reasoning in the PR body.

---

## Decisions already made

Settled. Do not reopen without a reason.

- **A separate Tally form for Suzuki**, not a rework of `dWPQOr`. `dWPQOr` still serves fiddle, harp
  and old-time from `/music` and `/music-lessons`; splitting the funnel is what makes paid Suzuki
  traffic attributable on its own.
- **`content_category` distinguishes lead value inside one pixel.** The Suzuki funnel reports to the
  same Maple & Spruce pixel as the newsletter, so `lesson-inquiry` vs `newsletter` is the only thing
  telling Meta a $130/month lead apart from an email signup. Browser and server halves must always
  agree; they share one `eventID` and Meta keeps the first event it sees.
- **Invoice stays the payment locus.** No new ledger, no generic transactions collection. Venmo, POS
  and card-on-file are `paymentRecord` sources on the existing model (#626).
- **Hope never flows through `Invoice`.** The guard in `create-invoice.ts` is load-bearing; Hope
  bills externally via the EMA portal. Model Hope submission state alongside, not through it.
- **Autopay is a rule, not a per-student toggle** (#798). Katie and Nathan already save cards in
  Square and charge by hand; the requirement is reusable, overridable rules with smart defaults, not
  a checkbox.
- **Materialise, then drain.** Recurring things become documents (lesson series, MT scheduled
  charges) and a job processes them. Billing rules generate scheduled charges the same way.
- **The recurring arrangement is a first-class object; concrete rows are a materialised window**
  (#797). Katie and Nathan think in standing slots, not lesson rows, and the row-only model is why a
  series silently runs out and why the Spruce Room is only visible as far as someone has materialised.
  Concrete `Lesson` records stay — rendered status, invoice line items, payouts, block attribution,
  POS attribution, `/my-day` and derived room events all read one — they just stop being the thing a
  human manages. Do **not** replace them with RRULE evaluation.
- **Hope is not Suzuki-specific.** The first Hope-covered student is taking regular guitar, not
  Suzuki. Anything Hope-shaped applies across all music lessons.
- **`rendered` and `no-show` are different facts, not two labels for one billing outcome.** Both
  charge a private-pay family; only `rendered` is ever submittable to Hope. That distinction has to
  survive from #796 into #799's queue structurally, not as a UI filter.
- **`rendered` and `no-show` are different facts, and `isSubmittableToHope` is the only
  Hope-billing test** (#796). Private pay charges for both; Hope charges for neither a no-show nor
  the family. Never re-derive "may Hope be billed for this" — call the helper, so the payout
  aggregator and the EMA queue cannot drift apart.
- **Row actions follow `StudentList`, not `LessonList`.** A single labeled primary action plus a
  `MoreVert` overflow menu, with per-action pending state. Unlabeled inline icon buttons for
  state-changing actions are the pattern being removed (#805) — do not add more of them.
- **Site framing is a directory of independent teachers.** Future lesson teachers are 1099
  contractors and Nathan is the sole W-2 exception; "Maple & Spruce assigns students" is a
  behavioral-control signal. See #669 and the contractor model notes.

---

## Needs David or Katie

Blocking where marked. Ask, don't guess.

| Question | Blocks | Why it can't be decided in code |
|---|---|---|
| What format does the EMA portal actually want for submissions? | **#804** | Do not invent a CSV schema for a state system. Get a real example from Katie. |
| On moving Hope payouts from *rendered* to *paid*: backfill existing rendered lessons as paid, or start clean? | **#804** | Changes historical payout figures. |


### Answered

| Question | Answer (David, 2026-09-03/04) |
|---|---|
| Is the `/suzuki` offer a free trial lesson or a no-cost meeting? | **A no-cost interview.** Not as strong a selling point as a trial lesson, but it is what the studio offers, and the live page and form copy already say it correctly. The page has to carry more of the persuasive weight as a result. |
| Is a no-show charged? | **Yes for private pay. For Hope, charged to nobody** — Hope pays only for services rendered and the family does not owe it privately. The studio absorbs it, so it should be visible rather than silent. See #796. |
| Can Hope be billed for services rendered before the guitar listing was approved? | **Yes, Hope pays backwards.** So historical entry (#799) is revenue recovery, not bookkeeping. A lesson rendered months ago is a normal `pending` submission and the queue must not de-prioritise it by age. |
| CPA (Danny Fink) on agent-vs-reseller revenue treatment. | #672, not this epic | Already tracked on #669. |

---

## Manual steps this epic creates

Things CI cannot do. Each belongs to the slice that creates it.

1. **Connect the Suzuki form's Tally webhook** to
   `https://us-east4-maple-and-spruce.cloudfunctions.net/tallyLeadWebhook` with the existing
   `TALLY_WEBHOOK_SECRET` — **after** `tallyLeadWebhook` deploys. Wiring it before the deploy files
   those leads into the wrong Meta dataset, and Meta cannot move events after the fact. This is
   exactly what bit the Music Together form.
2. **Re-paste `tools/webflow-tally-form-events.html`** into Webflow → Site Settings → Custom Code →
   Footer Code. The repo copy is the source of truth but is not deployed by anything; editing the
   file changes nothing on the live site until it is pasted and the site is published.
3. **Publish the Webflow site.** David's call, never automatic.
4. **Verify after deploy**: GA4 DebugView shows `generate_lead` with `form_name: suzuki-interview`,
   and Meta Events Manager shows one `Lead` (not two) on pixel `1625932185289127` with
   `content_category: lesson-inquiry`.

---

## Running this unattended

The board above is the state. An agent resuming cold should:

1. Read this file and `gh issue view 793`.
2. Pick the first slice whose status is `ready` and whose blocking questions are answered.
3. Follow the protocol. One slice, one PR, stop.
4. Update the board and the epic checklist as part of that PR.

Do not batch two slices into one PR, and do not start a slice whose blocking question is still open —
pick the next unblocked one instead and say why.
