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

| Surface | Meta event | GA4 event | Fired when |
|---|---|---|---|
| `MusicTogetherInterestWidget` | `Lead` | `generate_lead` | interest form submitted |
| `MusicTogetherDemoWidget` | `Schedule` | `schedule` | free demo RSVP (or demo waitlist join) |
| `MusicTogetherRegistrationWidget` | `ViewContent` | `view_item` | section page loads |
| `MusicTogetherRegistrationWidget` | `InitiateCheckout` | `begin_checkout` | Register clicked (pay attempt) |
| `MusicTogetherRegistrationWidget` | `Purchase` | `purchase` | registration confirmed |
| `sendMusicTogetherConversion` (server) | `Purchase` | — | `musicTogetherRegistrations` → `confirmed` |

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

## Manual Meta setup (one-time, not in code)

1. **Assign the pixel to the CAPI system user.** Business Settings → Users →
   System Users → the `META_CAPI_TOKEN` user → Add Assets → Data Sources →
   "Music Together data" → Manage. Without this, every server-side MT
   conversion 403s while the browser events keep working — so the symptom is
   quietly halved attribution, not an outage.

   Both ad accounts live in the **Maple & Spruce Folk Arts** portfolio, so one
   system user covers both pixels and no second token is needed. But portfolio
   membership only makes the system user *eligible* — Meta assigns data sources
   per asset, and a newly created pixel is not auto-attached to existing system
   users.

   **Check the pixel's owning portfolio first.** There is a second, near-empty
   portfolio named "Music Together Maple & Spruce" (0 ad accounts). If the pixel
   was created under that one rather than Folk Arts, it is a cross-portfolio
   asset and a plain assign won't reach it — you'd need asset sharing between
   the two portfolios. Verify at Events Manager → Data Sources →
   "Music Together data" → Settings → owning business.
2. **Mark the conversions.** Events Manager → the MT dataset → confirm `Lead`,
   `Schedule`, and `Purchase` appear once traffic starts.
3. **GA4.** `schedule` is a custom event — mark it as a key event in
   GA4 → Admin → Events if you want it counted as a conversion. `generate_lead`
   and `purchase` are already marked from the craft-class setup.

## Verifying

- Meta Events Manager → **Test Events** for pixel `1562555242035326`, then
  submit each of the three forms on the live site. Expect `PageView` + the
  event for that widget, and nothing on the Maple & Spruce pixel.
- The `Purchase` pair should show as **deduplicated** in Events Manager once a
  real registration comes through (browser + server, counted once).
- Locally: `npx vitest run apps/webflow-components/src` covers the browser side;
  `./tools/run-integration-tests.sh registration` covers the server side.

## Dev / prod isolation

Both Firebase projects point at the same MT pixel, same as the craft-class
setup — dev test registrations land in production attribution. At current test
volume that's rounding error, but once MT campaigns optimize for `Purchase` it
is worth a separate dev pixel. See the "Dev / prod isolation" section of
`tally-lead-webhook-setup.md` for the pattern.
