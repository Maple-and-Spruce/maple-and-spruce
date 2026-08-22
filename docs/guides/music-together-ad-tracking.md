# Music Together ad tracking

Music Together advertises from its **own Meta ad account**, separate from
Maple & Spruce. This doc is the map of what fires where, and the manual Meta
steps the code can't do for you.

| | Maple & Spruce | Music Together |
|---|---|---|
| Ad account | `act_74546555` | `act_1309930134551145` |
| Pixel | `1625932185289127` | `1562555242035326` ("Music Together data") |
| Server param | `META_PIXEL_ID` | `META_PIXEL_ID_MUSIC_TOGETHER` |
| Loaded by | GTM `GTM-P5NDCZSX`, site-wide | the MT widgets, on mount |

Both ad accounts sit in the **Maple & Spruce Folk Arts** business portfolio, so
both pixels are served by the same `META_CAPI_TOKEN` system user — no second
token, and no new `defineSecret` (which would otherwise have to exist in each
project's Secret Manager before the prod deploy could succeed).

## Why `trackSingle`, always

MT pages live on the **same Webflow site** as everything else, so the site-wide
GTM tag has already `init`'d the Maple & Spruce pixel by the time an MT widget
mounts. Once a second pixel is initialized, a bare `fbq('track', …)` broadcasts
to **every** initialized pixel — which would file MT conversions into the
Maple & Spruce dataset and make the separate ad account pointless.

`apps/webflow-components/src/lib/music-together-analytics.ts` therefore uses
`fbq('trackSingle', MUSIC_TOGETHER_PIXEL_ID, …)` for every event, and
`ensureMusicTogetherPixel()` to init the MT pixel + its `PageView` once per
page. Unit tests assert no un-scoped `track` call is ever made; don't
"simplify" them away.

## Event map

| Surface | Meta event | GA4 event | Fired when | `event_id` |
|---|---|---|---|---|
| MT updates banner (Tally `q4Qj8d`) | `Lead` | `generate_lead` | email signup from the MT header banner | `tally-<submissionId>` |
| `tallyLeadWebhook` (server) | `Lead` | `generate_lead` | Tally webhook for `q4Qj8d`, deduped with the row above | `tally-<submissionId>` |
| `MusicTogetherInterestWidget` | `Lead` | `generate_lead` | interest form submitted | `mt-interest-<hash>` |
| `addMusicTogetherInterest` (server) | `Lead` | — | a NEW interest entry, sent inline by the callable | `mt-interest-<hash>` |
| `MusicTogetherDemoWidget` | `Schedule` | `schedule` | free demo RSVP (or demo waitlist join) | `mt-demo-<hash>` |
| `addMusicTogetherDemoRsvp` (server) | `Schedule` | — | a NEW demo RSVP, sent inline by the callable | `mt-demo-<hash>` |
| `MusicTogetherRegistrationWidget` | `ViewContent` | `view_item` | section page loads | — |
| `MusicTogetherRegistrationWidget` | `InitiateCheckout` | `begin_checkout` | Register clicked (pay attempt) | — |
| `MusicTogetherRegistrationWidget` | `Purchase` | `purchase` | registration confirmed | `mt-<registrationId>` |
| `sendMusicTogetherConversion` (server) | `Purchase` | — | `musicTogetherRegistrations` → `confirmed` | `mt-<registrationId>` |

**Every MT conversion now has a server-side twin.** The first MT campaign spent
$124 over nine days, drove 328 landing page views, and reported **zero**
pixel-attributed conversions — and with browser-only tracking on the demo RSVP
there was no way to tell "nobody converted" from "the signal never arrived".
Ad blockers and Safari ITP eat an unknown share of the Pixel; the server half
is what survives that.

The **demo RSVP is the conversion this program optimizes against.** Paid
enrollment happens weeks later and in single digits, so `Purchase` alone can
never train a bidder. `Schedule` is the only MT event with real volume.

The MT updates banner is the one non-widget surface in that table. It is a Tally
popup (form `q4Qj8d`) sitting in the MT header, so its events come from the
site-wide footer snippet (`tools/webflow-tally-form-events.html`) rather than
from `music-together-analytics.ts`. That snippet keeps the same two rules: route
by Tally form id to the owning pixel, and address it with `trackSingle` after
re-using the `window.__mtPixelInitialized` flag so the MT pixel is init'd once
per page no matter which code path gets there first.

It is the one surface with a **server-side twin**: `tallyLeadWebhook` routes the
same lead by form id (`resolveFormAttribution`) and posts CAPI to whichever
pixel owns it. Both halves stamp `event_id` = `tally-<submissionId>`, so the
pair deduplicates the same way the registration `Purchase` pair does. See
`docs/guides/tally-lead-webhook-setup.md`.

### Why the top-funnel events send inline, not from a Firestore trigger

`sendMusicTogetherConversion` is an `onDocumentWritten` trigger because the
conversion it reports happens **later than any request**: Square's webhook flips
the registration to `confirmed` minutes after checkout, and no callable is
running at that moment.

Demo RSVP and interest signup are the opposite shape. The conversion *is* the
request — an RSVP is born final, there is no status flip to watch — and the
browser needs the `event_id` back **in that same response** to stamp on its
Pixel event. `tallyLeadWebhook`, the other top-of-funnel lead captured in one
public request, already posts CAPI inline for exactly these reasons.

A trigger would also have cost two more Cloud Run services against the ADR-029
deploy-write ratchet (60 writes per 60 seconds, uncapped-able) for no behavioral
gain. This change adds **zero** functions.

The cost is bounded on both sides: `MT_TOP_FUNNEL_CAPI_TIMEOUT_MS` is 2s (versus
the library's 5s default) because these sends block a form submit, and
`trySendMetaCapiEvents` never throws. The worst a broken Meta can do is add two
seconds and drop one attribution event — the seat is already committed.

Everything a trigger would need is still persisted on the document (`fbp`,
`fbc`, `eventSourceUrl`, `clientIp`, `clientUserAgent`) and the `event_id` is
derivable from the stored document alone, so promoting this to a trigger later
is a no-op on the wire.

### Why the top-funnel `event_id` is a hash

`mt-<registrationId>` works for enrollments because a Firestore auto-id is
meaningless outside our database. It does **not** work for these two, because
both collections are keyed by the family's **lowercased email** for idempotency
(`musicTogetherDemos/{demoId}/rsvps/{email}`, `musicTogetherInterest/{email}`).
`mt-demo-<docId>` would ship a plaintext email address to Meta in an unhashed
field — the exact thing the CAPI library exists to prevent.

So the id is a truncated SHA-256 over the same inputs
(`libs/firebase/meta-capi/src/lib/music-together-top-funnel.ts`). It keeps every
property that matters: stable across the browser/server pair, unique per (demo,
family) and per family, derivable from the stored document, and carrying no PII.

The **server owns the format**. The callable computes the id, sends its own
event under it, and returns it in the response; the widget passes it through
verbatim. Neither widget rebuilds it — that is what makes drift impossible.

### The server half only fires for a NEW entry

Both endpoints are public and unauthenticated. Sending on every call would let
anyone inflate a campaign's conversion count by replaying a signup. A repeat
demo RSVP is not a new conversion, and a family refining their interest-list
picks is engagement, not new demand.

The browser half still fires on a re-submit (unchanged behavior) under the same
stable id, which is what keeps Meta from booking it twice inside the dedup
window.

### Match keys

`MetaCapiUserIdentifiers` carries `ct` / `st` / `zp` / `country` / `external_id`
alongside `em` / `ph` / `fn` / `ln` / `fbp` / `fbc` / IP / UA. Two rules:

- **`country: 'us'` is sent on every event, everywhere.** We know it without
  asking, and a country hash costs nothing.
- **`external_id` is the lowercased email on every surface.** That is what lets
  Meta resolve one family's demo RSVP, interest signup, and later enrollment to
  a single person — the basis for a lookalike audience built off the RSVP.

`MusicTogetherRegistrationWidget` is the only surface that collects an address,
and it was previously discarded for matching. `parseUsAddress` now splits it
into `ct` / `st` / `zp`, **conservatively**: a wrong city hash is worse than no
city, because it matches nobody while presenting to Events Manager as a supplied
key. Anything it cannot identify unambiguously is simply not sent. (It also
refuses to read a bare two-letter English word as a state — `me`, `in`, `or`,
`ok`, `hi`, `la`, `pa`, and `id` are all USPS codes.)

Interest and demo are deliberately **different** events. Booking a specific demo
time is stronger intent than joining the interest list, so the two campaigns can
optimize toward different outcomes instead of competing for one `Lead` pool.

`InitiateCheckout` fires on the pay attempt, not on card-form render — that
makes the `InitiateCheckout → Purchase` gap read as real payment drop-off
(declines, tokenization failures) rather than duplicating `ViewContent`.

## Purchase deduplication

The browser `Purchase` and the server CAPI `Purchase` are the same conversion.
Both key on `mt-<registrationId>` and both report `value` =
**full committed tuition** (`totalCommittedCents`, sibling discount included),
with cash collected today in `custom_data.amount_paid_today`.

Two ways to break this, both of which silently double-count every enrollment:

1. Changing the `eventID` format on one side only.
2. Reporting a different `value` on each side — Meta resolves a mismatched
   deduplicated pair unpredictably.

`registration-conversions.spec.ts` asserts the server side posts to the MT
pixel (against the emulator + CAPI mock server), and the widget specs assert
the browser side's `eventID` and `value`.

## System user access — already configured

**Conversions API System User** (`61573278578829`), in the Maple & Spruce Folk
Arts portfolio, already holds the MT pixel as an assigned asset:

| Asset type | Asset | Permission |
|---|---|---|
| Pixels | Music Together data | View Pixels |
| Pixels | Maple & Spruce | View Pixels |
| Datasets | Music Together data | **Use events dataset** |
| Datasets | Maple & Spruce | **Use events dataset** |

The **Datasets → "Use events dataset"** row is the one that authorizes CAPI
sends; "View Pixels" alone is read-only. Music Together's permission pair is
identical to Maple & Spruce's, and M&S CAPI works in production today — so no
setup is needed and no new secret or second system user is involved.

This also settles pixel ownership: the MT pixel belongs to the Folk Arts
portfolio, not the separate near-empty "Music Together Maple & Spruce"
portfolio, so there is no cross-portfolio asset sharing to arrange.

If MT conversions ever start 403ing, this table is the first place to look —
specifically whether the *Datasets* assignment survived, not just the Pixels
one. The failure is silent (`sendMusicTogetherConversion` logs and swallows),
so the symptom is quietly halved attribution rather than an outage.

## Remaining setup

1. **Mark the conversions.** Events Manager → the MT dataset → confirm `Lead`,
   `Schedule`, and `Purchase` appear once traffic starts.
2. **GA4.** `schedule` is a custom event — mark it as a key event in
   GA4 → Admin → Events if you want it counted as a conversion. `generate_lead`
   and `purchase` are already marked from the craft-class setup.

## Verifying

- Meta Events Manager → **Test Events** for pixel `1562555242035326`, then
  submit each of the three forms on the live site. Expect `PageView` + the
  event for that widget, and nothing on the Maple & Spruce pixel.
- **Each pair should show as one conversion, not two.** In Test Events a
  deduplicated pair appears once with both a Browser and a Server source. If you
  see `Schedule` twice for one RSVP, the `event_id` broke — check that the
  widget is passing `result.data.eventId` through rather than building its own.
- Locally:
  - `npx vitest run apps/webflow-components/src` — the browser side
  - `npx vitest run --config vitest.storybook.config.ts apps/webflow-components/src/MusicTogetherDemoWidget.stories.tsx`
    — the demo widget driven in a real browser, asserting the `Schedule` carries
    the server's `eventID`
  - `./tools/run-integration-tests.sh music-together` — the server side against
    the emulators + the CAPI mock
    (`music-together-top-funnel-conversions.spec.ts`)
  - `./tools/run-integration-tests.sh registration` — the two `Purchase` triggers

## Dev / prod isolation

Both Firebase projects point at the same MT pixel, same as the craft-class
setup — dev test signups land in production attribution.

**This got sharper with this change.** It is no longer just `Purchase` (rare,
and obviously a test): every dev demo RSVP and interest signup now posts a real
`Schedule` / `Lead` with a **hashed email** to the production MT dataset. Those
hashes are exactly what a lookalike audience is seeded from, so a handful of
`verify-mt-*@mapleandsprucefolkarts.com` test families would teach Meta to go
find more people like us.

Tracked in **#782**: a separate dev pixel, or a `META_CAPI_ENABLED=false`
switch in `.env.dev`. See the "Dev / prod isolation" section of
`tally-lead-webhook-setup.md` for the pattern.

Until then: **do not run repeated demo/interest test signups against the dev
project**, and prune any test emails from the MT dataset before building a
lookalike audience off it.
