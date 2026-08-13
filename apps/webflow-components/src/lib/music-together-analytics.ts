/**
 * Music Together analytics events.
 *
 * Music Together advertises from its OWN Meta ad account (`act_1309930134551145`)
 * with its OWN pixel (`1562555242035326`, "Music Together data"), separate from
 * the Maple & Spruce account/pixel that drives craft classes. Keeping the two
 * datasets discrete is the whole point: MT campaign optimization must not be
 * trained on craft-class purchases, and vice versa.
 *
 * ## Why every call uses `trackSingle`
 *
 * The Maple & Spruce pixel is loaded site-wide via GTM (`GTM-P5NDCZSX`), and MT
 * pages live on the SAME Webflow site. Once we `fbq('init', …)` a second pixel,
 * a bare `fbq('track', …)` broadcasts to EVERY initialized pixel — which would
 * dump MT conversions into the Maple & Spruce dataset, the exact opposite of
 * what the separate ad account is for. `fbq('trackSingle', PIXEL_ID, …)` is the
 * only call form that addresses one pixel, so it is the only one used here.
 *
 * Do not "simplify" these to `fbq('track', …)`.
 *
 * ## Funnel
 *
 * Three public MT forms, three optimizable events, deliberately distinct so
 * each campaign can bid toward its own outcome:
 *
 * | Widget                            | Meta event  | GA4 event       |
 * |-----------------------------------|-------------|-----------------|
 * | `MusicTogetherInterestWidget`     | `Lead`      | `generate_lead` |
 * | `MusicTogetherDemoWidget`         | `Schedule`  | `schedule`      |
 * | `MusicTogetherRegistrationWidget` | `Purchase`  | `purchase`      |
 *
 * The registration widget also emits `ViewContent` / `InitiateCheckout` so the
 * MT pixel has upper-funnel signal to build audiences from.
 *
 * ## Dedup with the Conversions API
 *
 * `sendMusicTogetherConversion` already fires a server-side `Purchase` keyed
 * `mt-<registrationId>`. `buildMusicTogetherPurchasePixelEvent` passes the SAME
 * id as the Pixel's `eventID`, so Meta collapses the pair into one conversion.
 * If those two key formats ever drift, every MT enrollment double-counts.
 *
 * @see https://developers.facebook.com/docs/meta-pixel/advanced/#multiple-pixels
 * @see https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events
 */

import { MUSIC_TOGETHER_PIXEL_ID } from './meta-pixels';

const CURRENCY = 'USD';

/**
 * Re-exported so callers and tests can keep importing the id from the module
 * that uses it. The canonical declaration — and the reason both pixel ids live
 * side by side — is in `meta-pixels.ts`.
 */
export { MUSIC_TOGETHER_PIXEL_ID };

/** Meta standard events this module emits, all scoped to the MT pixel. */
export type MusicTogetherPixelEventName =
  | 'ViewContent'
  | 'Lead'
  | 'Schedule'
  | 'InitiateCheckout'
  | 'Purchase';

export interface MusicTogetherPixelEvent {
  name: MusicTogetherPixelEventName;
  params: Record<string, unknown>;
  /** Dedup key shared with the server-side CAPI event, when there is one. */
  eventID?: string;
}

export interface MusicTogetherDataLayerEvent {
  event: 'view_item' | 'generate_lead' | 'schedule' | 'begin_checkout' | 'purchase';
  [key: string]: unknown;
}

export interface ViewSectionInput {
  sectionId: string;
  sectionName: string;
  priceFullCents: number;
}

export interface InterestSignupInput {
  /** Section ids the family checked off; may be empty when they only left a note. */
  interestedSectionIds: string[];
  /** True when this email was already on the list (a re-submit, not new demand). */
  alreadyOnList: boolean;
}

export interface DemoRsvpInput {
  demoId: string;
  /** ISO instant of the demo class. */
  demoDateTime: string;
  /** `waitlisted` when the demo was full — still intent, but not a seat. */
  rsvpStatus: 'confirmed' | 'waitlisted';
}

export interface InitiateCheckoutInput {
  sectionId: string;
  sectionName: string;
  priceFullCents: number;
}

export interface MusicTogetherPurchaseInput {
  /** Firestore `musicTogetherRegistrations` doc id — the dedup key's payload. */
  registrationId: string;
  sectionId: string;
  sectionName: string;
  /** Full committed tuition, matching the server event's `value`. */
  totalCommittedCents: number;
  /** Cash actually collected today (installment 1, or the full price). */
  amountChargedCents: number;
  paymentPlan: 'full' | 'installments';
}

function centsToAmount(cents: number): number {
  return Math.round(cents) / 100;
}

// ---------------------------------------------------------------------------
// Pixel event builders
// ---------------------------------------------------------------------------

export function buildViewSectionPixelEvent(
  input: ViewSectionInput
): MusicTogetherPixelEvent {
  return {
    name: 'ViewContent',
    params: {
      content_ids: [input.sectionId],
      content_type: 'product',
      content_name: input.sectionName,
      content_category: 'music_together',
      value: centsToAmount(input.priceFullCents),
      currency: CURRENCY,
    },
  };
}

export function buildInterestPixelEvent(
  input: InterestSignupInput
): MusicTogetherPixelEvent {
  return {
    name: 'Lead',
    params: {
      content_name: 'music-together-interest',
      content_category: 'music_together_interest',
      // Which sections the demand points at — lets us read the interest list
      // by section in Events Manager without a separate report.
      content_ids: input.interestedSectionIds,
      content_type: 'product',
      // A repeat submit is real engagement but not new demand; keeping the flag
      // on the event means campaign reporting can exclude it if it ever skews.
      already_on_list: input.alreadyOnList,
    },
  };
}

export function buildDemoRsvpPixelEvent(
  input: DemoRsvpInput
): MusicTogetherPixelEvent {
  return {
    name: 'Schedule',
    params: {
      content_name: 'music-together-demo',
      content_category: 'music_together_demo',
      content_ids: [input.demoId],
      content_type: 'product',
      demo_date_time: input.demoDateTime,
      // Distinguishes a booked seat from a full-demo waitlist join. Both are
      // worth optimizing toward, but they are not the same intent.
      rsvp_status: input.rsvpStatus,
    },
  };
}

export function buildInitiateCheckoutPixelEvent(
  input: InitiateCheckoutInput
): MusicTogetherPixelEvent {
  return {
    name: 'InitiateCheckout',
    params: {
      content_ids: [input.sectionId],
      content_type: 'product',
      content_name: input.sectionName,
      content_category: 'music_together',
      value: centsToAmount(input.priceFullCents),
      currency: CURRENCY,
      num_items: 1,
    },
  };
}

/**
 * Browser `Purchase`, deduplicated against `sendMusicTogetherConversion`.
 *
 * `value` is the family's FULL COMMITTED TUITION, not the cash collected today
 * — it must match the server event exactly (see the value-semantics note atop
 * `send-music-together-conversion.ts`). A mismatched `value` on a deduplicated
 * pair is resolved unpredictably by Meta, so do not report the charged amount
 * here.
 */
export function buildMusicTogetherPurchasePixelEvent(
  input: MusicTogetherPurchaseInput
): MusicTogetherPixelEvent {
  return {
    name: 'Purchase',
    // Must stay byte-identical to the server's `mt-${registrationId}`.
    eventID: `mt-${input.registrationId}`,
    params: {
      content_ids: [input.sectionId],
      content_type: 'product',
      content_name: input.sectionName,
      content_category: 'music_together',
      value: centsToAmount(input.totalCommittedCents),
      currency: CURRENCY,
      // One registration is one family enrollment regardless of child count.
      num_items: 1,
      payment_plan: input.paymentPlan,
      amount_paid_today: centsToAmount(input.amountChargedCents),
    },
  };
}

// ---------------------------------------------------------------------------
// GA4 dataLayer event builders
// ---------------------------------------------------------------------------

export function buildViewSectionDataLayerEvent(
  input: ViewSectionInput
): MusicTogetherDataLayerEvent {
  const price = centsToAmount(input.priceFullCents);
  return {
    event: 'view_item',
    ecommerce: {
      currency: CURRENCY,
      value: price,
      items: [
        {
          item_id: input.sectionId,
          item_name: input.sectionName,
          item_category: 'music_together',
          price,
          quantity: 1,
        },
      ],
    },
  };
}

export function buildInterestDataLayerEvent(
  input: InterestSignupInput
): MusicTogetherDataLayerEvent {
  return {
    event: 'generate_lead',
    form_name: 'music-together-interest',
    section_count: input.interestedSectionIds.length,
    already_on_list: input.alreadyOnList,
  };
}

export function buildDemoRsvpDataLayerEvent(
  input: DemoRsvpInput
): MusicTogetherDataLayerEvent {
  return {
    event: 'schedule',
    form_name: 'music-together-demo',
    demo_id: input.demoId,
    demo_date_time: input.demoDateTime,
    rsvp_status: input.rsvpStatus,
  };
}

export function buildInitiateCheckoutDataLayerEvent(
  input: InitiateCheckoutInput
): MusicTogetherDataLayerEvent {
  const price = centsToAmount(input.priceFullCents);
  return {
    event: 'begin_checkout',
    ecommerce: {
      currency: CURRENCY,
      value: price,
      items: [
        {
          item_id: input.sectionId,
          item_name: input.sectionName,
          item_category: 'music_together',
          price,
          quantity: 1,
        },
      ],
    },
  };
}

export function buildMusicTogetherPurchaseDataLayerEvent(
  input: MusicTogetherPurchaseInput
): MusicTogetherDataLayerEvent {
  const value = centsToAmount(input.totalCommittedCents);
  return {
    event: 'purchase',
    ecommerce: {
      currency: CURRENCY,
      value,
      transaction_id: input.registrationId,
      payment_plan: input.paymentPlan,
      amount_paid_today: centsToAmount(input.amountChargedCents),
      items: [
        {
          item_id: input.sectionId,
          item_name: input.sectionName,
          item_category: 'music_together',
          price: value,
          quantity: 1,
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

type FbqFn = (...args: unknown[]) => void;

interface AnalyticsWindow {
  fbq?: FbqFn;
  dataLayer?: Record<string, unknown>[];
  /** Set by `ensureMusicTogetherPixel` so `fbq('init')` runs at most once. */
  __mtPixelInitialized?: boolean;
}

// Accepts `unknown` rather than a structural Window type so callers can pass
// the real `window` without fighting third-party global augmentations — gtag.js
// and fbevents each declare their own shapes for `fbq` / `dataLayer`.
function asAnalyticsWindow(win: unknown): AnalyticsWindow | null {
  if (win === null || typeof win !== 'object') return null;
  return win as AnalyticsWindow;
}

/**
 * Initialize the Music Together pixel and fire its `PageView`, at most once.
 *
 * The site-wide GTM tag only inits the Maple & Spruce pixel, so without this
 * the MT pixel has no `PageView` and therefore no audience to retarget and no
 * landing-page signal for the MT ad account.
 *
 * Safe to call on every mount: guarded by a flag on `window`. Returns whether
 * the pixel is available (false when fbevents.js hasn't loaded — an ad blocker,
 * or GTM still in flight).
 */
export function ensureMusicTogetherPixel(win: unknown): boolean {
  const w = asAnalyticsWindow(win);
  if (!w || typeof w.fbq !== 'function') return false;
  if (w.__mtPixelInitialized) return true;
  w.fbq('init', MUSIC_TOGETHER_PIXEL_ID);
  w.fbq('trackSingle', MUSIC_TOGETHER_PIXEL_ID, 'PageView');
  w.__mtPixelInitialized = true;
  return true;
}

/**
 * Send one MT pixel event + one GA4 dataLayer event.
 *
 * The pixel half is addressed with `trackSingle` so it lands ONLY in the Music
 * Together dataset. The GA4 half is undivided on purpose — one property covers
 * the whole business, and MT rows are already distinguishable by event and
 * `item_category`.
 */
function dispatch(
  win: unknown,
  pixel: MusicTogetherPixelEvent,
  dataLayer: MusicTogetherDataLayerEvent
): void {
  const w = asAnalyticsWindow(win);
  if (!w) return;

  if (ensureMusicTogetherPixel(w) && typeof w.fbq === 'function') {
    if (pixel.eventID) {
      w.fbq(
        'trackSingle',
        MUSIC_TOGETHER_PIXEL_ID,
        pixel.name,
        pixel.params,
        { eventID: pixel.eventID }
      );
    } else {
      w.fbq('trackSingle', MUSIC_TOGETHER_PIXEL_ID, pixel.name, pixel.params);
    }
  }

  const layer = w.dataLayer ?? [];
  layer.push(dataLayer as unknown as Record<string, unknown>);
  w.dataLayer = layer;
}

// ---------------------------------------------------------------------------
// Trackers — the public surface the widgets call
// ---------------------------------------------------------------------------

/** Family landed on an MT section page with the registration widget on it. */
export function trackViewMusicTogetherSection(
  win: unknown,
  input: ViewSectionInput
): void {
  dispatch(
    win,
    buildViewSectionPixelEvent(input),
    buildViewSectionDataLayerEvent(input)
  );
}

/** Family submitted the cross-section interest list form. */
export function trackMusicTogetherInterest(
  win: unknown,
  input: InterestSignupInput
): void {
  dispatch(
    win,
    buildInterestPixelEvent(input),
    buildInterestDataLayerEvent(input)
  );
}

/** Family RSVP'd to a free demo class (or joined a full demo's waitlist). */
export function trackMusicTogetherDemoRsvp(
  win: unknown,
  input: DemoRsvpInput
): void {
  dispatch(
    win,
    buildDemoRsvpPixelEvent(input),
    buildDemoRsvpDataLayerEvent(input)
  );
}

/** Family reached the payment step of a section registration. */
export function trackMusicTogetherInitiateCheckout(
  win: unknown,
  input: InitiateCheckoutInput
): void {
  dispatch(
    win,
    buildInitiateCheckoutPixelEvent(input),
    buildInitiateCheckoutDataLayerEvent(input)
  );
}

/** Registration confirmed and paid. Deduped against the server CAPI event. */
export function trackMusicTogetherPurchase(
  win: unknown,
  input: MusicTogetherPurchaseInput
): void {
  dispatch(
    win,
    buildMusicTogetherPurchasePixelEvent(input),
    buildMusicTogetherPurchaseDataLayerEvent(input)
  );
}
