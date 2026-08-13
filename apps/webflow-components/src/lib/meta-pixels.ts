/**
 * Meta pixel ids for the public Webflow widgets.
 *
 * The business runs TWO Meta ad accounts against ONE Webflow site:
 *
 * | Brand           | Ad account            | Pixel              | Loaded by            |
 * |-----------------|-----------------------|--------------------|----------------------|
 * | Maple & Spruce  | `act_74546555`        | `1625932185289127` | GTM, site-wide       |
 * | Music Together  | `act_1309930134551145`| `1562555242035326` | GTM, `^/music-together` |
 *
 * They are deliberately separate datasets: MT campaign optimization must not be
 * trained on craft-class purchases, and craft-class campaigns must not be
 * trained on MT enrollments.
 *
 * ## The rule that keeps them apart
 *
 * Because both pixels can be initialized on the same site, a bare
 * `fbq('track', …)` broadcasts to EVERY initialized pixel. Every tracking call
 * in this app must therefore use `fbq('trackSingle', <pixelId>, …)`, which
 * addresses exactly one dataset.
 *
 * This is not a style preference. A single bare `track()` anywhere is enough to
 * silently cross-contaminate both ad accounts, and the symptom (one brand's
 * numbers looking mysteriously good) is easy to miss for weeks.
 *
 * The same rule applies to hand-written snippets pasted into Webflow — see
 * `tools/webflow-tally-form-events.html`.
 */

/** Maple & Spruce craft classes. Initialized site-wide by GTM `GTM-P5NDCZSX`. */
export const MAPLE_SPRUCE_PIXEL_ID = '1625932185289127';

/**
 * Music Together. Initialized by a GTM tag scoped to `^/music-together`, with
 * `ensureMusicTogetherPixel()` as a self-init fallback for widget-bearing pages.
 * Mirrors the server-side `META_PIXEL_ID_MUSIC_TOGETHER` param — if the two
 * drift, browser and CAPI events stop deduplicating.
 */
export const MUSIC_TOGETHER_PIXEL_ID = '1562555242035326';
