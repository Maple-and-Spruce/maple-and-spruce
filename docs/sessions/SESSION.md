# Session Context

> **DIRECTIVE**: Keep this file updated with current work status. Archive completed sessions to `history/YYYY-MM-DD.md`.

---

## Current Status

### Standing lesson schedules, PR 1: the arrangement becomes an object (2026-09-04, #797)

Katie and Nathan think in standing arrangements — "Nathan teaches Ellie on Tuesdays at 4:00". The
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


### Needs Attention: six invisible states, now a to-do list (2026-09-04, #807)

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
their own students and lessons (`instructorIdForUser`, #616). The response carries `scopedToSelf` and
the panel says "showing only your own students" — because an empty panel means *"nothing is wrong"*
to Katie and *"nothing of yours is wrong"* to Nathan, and those are different claims.

The classifiers live in `@maple/ts/domain` as pure functions, so each "is this wrong?" rule has one
definition rather than one in a query and a second in a component. Two of them encode judgements
worth keeping: a **no-show counts as unbilled** for private pay (the slot was charged), and a
**Hope student is never flagged for `autoInvoice`** because `createInvoice` refuses Hope outright, so
the row would be noise nobody can act on.


### Hope Scholarship billing has a ledger (2026-09-04, #799)

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
(#796), *and* `recordHopeSubmissions` re-checks every lesson server-side. Hiding a no-show in the UI
is not enough: a stale client could otherwise claim public money for a lesson nobody attended. Both
halves are covered by integration tests.

**Historical entry reuses `createLessonSeries` rather than adding a parallel shape.** It gained an
optional `status`, so a backfill is "the same series creation, with past dates, already rendered".
Everything downstream — payouts, the Hope queue, the room schedule — reads ordinary `Lesson` records,
and a separate "historical lesson" entity would have had to be taught to all of it.

Block attribution (#686) is **waived for a backfill only**. That rule stops *new* lessons being
dropped at arbitrary times; a lesson that already happened happened whether or not a block covers
that weekday, and refusing to record it would mean refusing to claim money the studio has earned.
Backfilled lessons carry `blockId: null` and surface as "needs a block" — the existing grandfather
path. An integration test asserts a **future**-dated series without a block is still refused, so the
exemption cannot become a hole.

**The index analyzer earned its keep**: the new Hope query needed a `lessons` composite index on
`studentId + status + scheduledAt` that the emulator would never have complained about. Declared in
the same PR, per the rule.

**Still open (#804):** the EMA export format, moving payouts to count Hope at *paid* rather than
*rendered*, and making Hope rates admin-editable. All three wait on answers.


### `no-show` is its own lesson status, and it bills in two directions (2026-09-04, #796)

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
  comparing to `'rendered'` itself, so the payout aggregator and #799's EMA submission queue cannot
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

UI is built on #805's pattern: on `/my-day` "No-show" sits beside "Mark rendered" (two taps stays two
taps), and in `LessonList` it is an overflow item — "it happened" is the overwhelmingly common
answer, and two competing primaries on every past row would slow the common case to help the rare one.

**This unblocks #799.** The Hope submission queue can now exclude no-shows structurally instead of
hoping a UI filter remembers to.


### Lesson row actions: labelled primary + overflow, per-row progress (2026-09-04, #805)

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


### Lesson inquiries land in the portal (2026-09-04, #795 / epic #793)

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
#795 was originally framed around: a scheduled function has no cold-start budget to protect, so it
lives in `maple-core` with no new codebase and no second webhook to wire.

**The API shape is not the webhook shape, and this was verified rather than assumed.** The webhook
sends self-describing fields (`{key, label, type, value}`); the submissions API returns `questions`
once per page and `responses` as `{questionId, answer}`, where `answer` is a string, a string array
of already-resolved option **text**, or — for hidden fields — a single object keyed by field name
whose question has `label: null`. Mapping this against the webhook's shape would have compiled,
passed an invented fixture, and captured nothing. The spec fixtures are real captured payloads.

Idempotence is structural: the Firestore doc id **is** the Tally submission id and ingestion uses
`create()`, so a re-poll cannot reset an `enrolled` lead back to `new`.

`/leads` is built on the action pattern #805 is moving the lesson surfaces onto — one labelled
primary action, a `MoreVert` overflow, and **per-row** pending state rather than the page-wide `busy`
boolean `/my-day` still uses. No reason to build a new surface with the defect we just filed.

**Manual step, and the deploy fails without it:** set the **`TALLY_API_KEY`** secret in each
project's Secret Manager before this merges. A declared-but-unset `defineSecret` breaks the deploy
(#531 would detect this; it is still open).

**Not done here:** the acknowledgement email to the family. Tally respondent notifications need Tally
Pro, and `queueMail` still cannot enter `maple-webhooks`. Now that inquiries are Firestore documents,
the natural home is a trigger on `lessonInquiries` — worth its own slice.

### Suzuki intake form + lead attribution (2026-09-03, #794 / epic #793)

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
`maple-webhooks` without re-inflating the bundle. It moves to **#795**, where persisting the lead
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
The admin surface is; the funnel and the billing automation are not. Epic **#793** holds the six
slices, and `docs/reference/suzuki-readiness-plan.md` is the standing execution plan.

Closed **#362** (add Nathan as an instructor) as stale — he has been live at
`/instructors/nathan-zucker` for a while.

### Music Together pilot half-off: discount codes at checkout + waivable installments (2026-09-03, #791)

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
  MT prices a family, not slots, and additional children already get the sibling discount (#599).
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

### Music Together spot counts never reached the public site (2026-09-03, #800)

Stephanie reported the Thursday Morning section still advertising **8 spots left** after a family
registered (admin showed `1 / 8 families`). It was not a device cache — the stale number was in the
server-rendered HTML.

`spots-remaining` / `spots-display` on an MT section were written by exactly one thing:
`syncMusicTogetherSectionToWebflow`, a trigger on `musicTogetherSections/{sectionId}`. A registration
never touches the section document, so the count Webflow captured at the last admin edit was frozen
there. Classes have had the equivalent trigger since #143 (`syncRegistrationCount`); MT never got one.

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
  bookkeeping write and an outbound publish is the argument for #802.
- **Hidden sections are skipped, not synced.** A hidden section has no CMS item (the section trigger
  removes it); syncing one here would resurrect a card that was deliberately pulled.

**Verification**: 23 unit tests; 5 integration tests against the emulators + the Webflow mock
(`sync-mt-registration-count.spec.ts`) asserting the `fieldData` actually sent to the CMS —
registration drops the count, cancel and delete give the spot back, and the last spot flips
`spots-display` to `Full` and `status` to `full`. Full MT suite: 99 passed.

**Note for the fix-forward**: existing sections still hold whatever count Webflow last captured.
Re-saving each affected section in admin republishes it with the live number.

---

### Server-side Meta signals for MT demo RSVPs + interest signups (2026-08-22, #781)

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
  Meta from booking it twice. Same reasoning as the email idempotency from #778.
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
3. **#782 — dev and prod still share the production pixel.** This got sharper: it is no longer just
   rare `Purchase` events, it is every dev demo RSVP and interest signup posting a real hashed email
   into the production MT dataset. Do not run repeated dev test signups, and prune test emails
   before building a lookalike off that data.

### Music Together registration email sequences (2026-08-17, #778)

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
map is the seam for **#775** (dedicated sending provider, arbitrary validated senders) and **#756**
(Trigger Email decommission 2027-03-31) — when either lands, only `SENDER_FROM` changes.

Reminders run in one daily 08:00 ET function with five idempotent passes: sections meeting today
(weekly nudge), first class at 7d and 48h, demos at 7d and 48h.

**Not yet done:** `tools/backfill-mt-signup-emails.ts` is written and dry-run-safe but has **not**
been run against prod. Families who signed up before this shipped are still unacknowledged until it
runs with `--send`.

### Related classes moved from a Cloud Function to the Webflow CMS (2026-08-17, #776)

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
Webhook URL is unchanged, so no Square dashboard change was needed. Shipped in #761.

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

Note: the dev-CMS-leak guard from #728 is working — all 21 dev-synced class items are correctly drafts. The stale pages were real prod classes, not dev leakage.

**Next steps**: recurring offerings still share a `<title>` (e.g. two "Stained Glass - TryIt Class"); binding a short date into the template title would make every page unique. Also consider the same auto-expiry for MT sections/semesters, and `/about` has no JSON-LD at all.

---

**Date**: 2026-06-26
**Status**: Phase 4 complete; Phase 5 in progress. Spruce Room availability epic (#467) — PRs 1 & 2 shipped; adding the upcoming-schedule agenda (#504).

### Spruce Room upcoming-schedule agenda (#504, 2026-06-26)

The epic deferred a "check the calendar" view ("Add later only if missed"). It was missed — the portal could say if the room was free *right now* and warn on conflicts inline, but there was no way to see all upcoming usage to plan around. Added a read-only **agenda view** at `/room-schedule` (Calendar nav group + a "View schedule" link on the dashboard room widget): bookings over the next 2/4/8 weeks grouped by day, with consecutive free days collapsed into an "Open" range.

Pure additive UI on top of the existing `getRoomSchedule` callable — **no backend or Firestore index changes**:
- `groupRoomScheduleByDay` domain helper (`libs/ts/domain/room.ts`) + unit tests
- `useRoomScheduleRange(room, start, end)` hook (`libs/react/rooms`) — generalizes `useRoomScheduleForDate` to an arbitrary span
- `RoomScheduleAgenda` / `RoomScheduleAgendaList` components (`libs/react/rooms`) + tests

### Spruce Room availability — PR 1 shipped (2026-06-11)

The Spruce Room is going multi-tenant (music lessons, Music Together, ad hoc uses); David/Katie/Nathan need to know if it's free. Epic #467 holds the product decisions and architecture; the portal is the source of truth for room occupancy.

PR 1 (#468 / PR #470): `room` field on CalendarEvent/Class, `onLessonWrite` trigger deriving private room-blocking events from scheduled lessons (closing the gap where lessons were invisible to the calendar aggregation), `getRoomSchedule` admin callable + composite index, and the dashboard "Spruce Room right now" widget.

**Next steps**:
- PR 2 (#469): ad hoc "Book the Spruce Room" form, day strip + warn-and-confirm conflict warnings in ScheduleLessonDialog / class form / event form
- Ops: onboard Nathan (he signs up at `/login`, grant admin from `/users`) — decided full admin is fine

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

Branch: `feature/283-teacher-payouts` (PR #304)

All 6 sub-issues of epic #10 implemented:
- #278 Student records + admin UI
- #279 Lesson scheduling + recurring series
- #280 Private-pay invoice initiation
- #281 Square invoice delivery + webhook payment attribution
- #282 Hope Scholarship handling (rates, rendered-lesson tracking, invoice guard)
- #283 Teacher payout tracking (aggregation from both sources, substitute attribution)

**Requirements reviewed and updated** — REQUIREMENTS.md Phase 4 section rewritten to match actual implementation. Deferred items documented (lesson packages, teacher availability, public profiles).

### Phase 5: Unified Inventory, Etsy Push, & Sales Tracking

**Planning completed 2026-04-19.** Admin app is single source of truth for products, pushing to Etsy + Square. Sales on either channel auto-record with cross-channel inventory sync.

**Etsy API approved** (2026-03-27, `maplspruce-listings` app, Personal Access tier).

8 of 9 PRs merged 2026-04-19 → 2026-04-22. Picking up the remaining admin UI work (#312) on 2026-05-08, split into two reviewable PRs.

| PR | Issue | Title | Status |
|----|-------|-------|--------|
| 1 | #305 | Product variant model refactor | Merged (#314) |
| 2 | #306 | Square multi-variation catalog support | Merged (#318) |
| 3 | #307 | Push-to-Etsy Cloud Function | Merged (#319) |
| 4 | #308 | Etsy import multi-variant support | Merged (#322) |
| 5 | #309 | Sale recording + InventoryMovement audit log | Merged (#317) |
| 6 | #310 | Etsy order polling + cross-channel inventory sync | Merged (#324) |
| 7 | #311 | Etsy sync conflict detection + resolution | Merged (#325) |
| 8a | #312 | Admin UI — variants in ProductForm + DataTable | Merged (#402) |
| 8b | #312 | Admin UI — `/sales` page + Push-to-Etsy button | **In progress** (this PR) |
| 9 | #313 | Artist payout calculation + admin page | Merged (#321) |

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
- PR: [#231](https://github.com/Maple-and-Spruce/maple-and-spruce/pull/231)
- Ported from standalone prototype: github.com/david-shortman/image2pages-web

### Registration Launch: Meta Ads Readiness

Goal: enable paid Meta ads driving traffic to Webflow class registration pages.

### What's Done

**Wave 1 code (all merged):**
- PR #213 — Class roster admin page (#211)
- PR #214 — Email templates for confirmation + cancellation (#197)
- PR #216 — syncRegistrationCount Cloud Function (#143)
- PR #217 — Integration tests for syncClassToWebflow (#206)
- PR #218 — Integration test foundation with 8 domain-specific projects (#167)
- PR #226 — Square receipt URL in registrations + emails (#192) — auto-merge pending

**Registration flow verified:**
- Registration widget placed on Webflow CMS class detail page
- Props bound to CMS fields (firebase-id → classId)
- Tested working end-to-end with dev Square configuration

**Analysis completed:**
- #205 sync fields already implemented — remaining work is Webflow Designer binding
- #202 component already placed — just needed manual prop configuration (done)

### Remaining Work (Manual Ops)

| Task | Issue | Owner | Notes |
|------|-------|-------|-------|
| AWS account + SES setup | #223 | David | **Start first** — production access takes 24-48h |
| Firebase email extension | #195 | David | After SES; then run `tools/seed-email-templates.ts` |
| GA4 + GTM | #116 | David | Google/Webflow console work |
| Meta Pixel | #224 | David | After GTM; needed for ad optimization |
| Privacy + cancellation policy pages | #225 | David/Katie | Webflow content pages |
| Canonical domain + sitemap | #120 | David | DNS + Webflow settings |
| Switch widget to prod Square credentials | — | David | Webflow Designer, last step |
| Upcoming Classes page enhancements | #210 | In progress | Agent working on Webflow MCP |

### Issues Created This Session

| Issue | Title |
|-------|-------|
| #215 | Admin email template management with preview |
| #222 | Configure required status checks for PR merging |
| #223 | Create AWS account + SES for Maple & Spruce |
| #224 | Install Meta Pixel via GTM |
| #225 | Privacy policy + cancellation policy pages |

### Key Decisions Made

- **Handlebars templates** for emails (matches existing `createRegistration` code pattern, easier to update than inline HTML)
- **Agent Teams** enabled for parallel development (experimental feature)
- **Per-domain integration test apps** structure from #218 (artist, class, instructor, etc.)
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
