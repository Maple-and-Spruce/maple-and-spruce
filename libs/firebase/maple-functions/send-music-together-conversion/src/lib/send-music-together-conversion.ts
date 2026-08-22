/**
 * Send Music Together Conversion Cloud Function
 *
 * Firestore trigger that fires a Meta Conversions API `Purchase` when a Music
 * Together registration becomes `confirmed`.
 *
 * Mirrors `sendRegistrationConversion` (craft classes) on the MT collection.
 * MT is the second revenue line and, until now, the only one with no
 * `Purchase` signal at all — the MT widget fires no browser Pixel event
 * either, so before this every MT enrollment was invisible to Meta's
 * optimizer and got mis-attributed as organic.
 *
 * SEPARATE pixel, same secret: Music Together now advertises from its own Meta
 * ad account (`act_1309930134551145`) with its own pixel (`1562555242035326`,
 * "Music Together data"), so these events go to `META_PIXEL_ID_MUSIC_TOGETHER`,
 * NOT the Maple & Spruce `META_PIXEL_ID`. Mixing them would train the craft-class
 * campaigns on MT enrollments and vice versa. Both ad accounts sit in the same
 * business portfolio and the `META_CAPI_TOKEN` system user already holds
 * "Use events dataset" on the MT dataset, so no new secret and no extra setup.
 *
 * The browser twin lives in `apps/webflow-components/src/lib/music-together-
 * analytics.ts` and must stay pointed at the same pixel id.
 *
 * `value` semantics — deliberate, and please do not "fix" this back:
 * we report the family's FULL COMMITTED TUITION (`totalCommittedCents`,
 * sibling discount included), NOT the amount collected at registration.
 *
 * This looks wrong at first glance — an installment family has only paid
 * installment 1 — but it is not a cash-timing question. Installment 2 is
 * charged around Week 5, which is FAR outside Meta's 7-day click attribution
 * window, so a follow-on `Purchase` for it could never be attributed to the ad
 * that drove the signup. The real choice is therefore "report the full value
 * now" vs "never report half of it at all". Reporting installment 1 only would
 * make installment families look half as valuable to Meta's bidder as
 * pay-in-full families who commit the SAME total, training the algorithm to bid
 * against a cohort for no business reason. And because we deliberately send no
 * `Refund` events, the lower number buys no accuracy on cancellations either —
 * it just systematically undercounts one cohort.
 *
 * Consequently there is NO `Purchase` event for installments 2..N — with
 * `value` already carrying the full committed total, one would double-count.
 * `custom_data.amount_paid_today` preserves the cash-timing story for anyone
 * reading Events Manager.
 *
 * Best-effort by design: a CAPI failure is logged and swallowed — a dropped
 * conversion must never retry-loop or affect the registration itself.
 */
import {
  onDocumentWritten,
  type Change,
  type DocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import {
  parseUsAddress,
  trySendMetaCapiEvents,
  type MetaCapiConfig,
  type MetaCapiEvent,
} from '@maple/firebase/meta-capi';

// Reuses the same secret as `tallyLeadWebhook` and `sendRegistrationConversion`
// (all maple-core) — one system-user token covers both pixels, so no new Secret
// Manager value is required.
const metaCapiToken = defineSecret('META_CAPI_TOKEN');
// The Music Together pixel, NOT `META_PIXEL_ID`. Keep the default in sync with
// `MUSIC_TOGETHER_PIXEL_ID` in the webflow-components analytics lib, or the
// browser and server `Purchase` events land in different datasets and stop
// deduplicating (every enrollment then counts twice).
const metaPixelId = defineString('META_PIXEL_ID_MUSIC_TOGETHER', {
  default: '1562555242035326',
});
const metaCapiBaseUrl = defineString('META_CAPI_BASE_URL', {
  default: 'https://graph.facebook.com',
});
const metaCapiApiVersion = defineString('META_CAPI_API_VERSION', {
  default: 'v20.0',
});

/** The subset of Music Together registration fields this trigger reads. */
export interface MusicTogetherConversionData {
  sectionId?: string;
  email?: string;
  phone?: string | null;
  adultFirstName?: string;
  adultLastName?: string;
  /**
   * Single-line mailing address collected by the registration widget. Split
   * into Meta's `ct` / `st` / `zp` match keys — this is the only surface in the
   * business that collects an address, and it went unused for matching until
   * now.
   */
  address?: string | null;
  /** Amount charged AT REGISTRATION — installment 1 for an installment plan. */
  pricePaidCents?: number;
  /**
   * The family's total committed tuition (sibling discount included). This is
   * the Meta `value`. Absent on registrations reserved before the field
   * existed, in which case we fall back to `pricePaidCents`.
   */
  totalCommittedCents?: number;
  paymentPlan?: string;
  /** How many future installments were scheduled (0 for pay-in-full). */
  scheduledChargeCount?: number;
  children?: unknown[];
  status?: string;
  /** Attribution cookies, persisted at reservation time when available. */
  fbp?: string | null;
  fbc?: string | null;
  /** MT section page URL the registration was made from, when captured. */
  eventSourceUrl?: string | null;
  /** Browser context captured by the callable, for probabilistic matching. */
  clientIp?: string | null;
  clientUserAgent?: string | null;
}

/**
 * Decide whether an MT registration write should emit a `Purchase`.
 *
 * Fires exactly once, on the (created-or-pending) -> `confirmed` transition,
 * and only when money actually changed hands and we have an email to match on.
 */
export function shouldEmitMusicTogetherPurchase(
  before: MusicTogetherConversionData | undefined,
  after: MusicTogetherConversionData | undefined
): boolean {
  if (!after) return false;
  // Only when it just became confirmed — an already-confirmed doc being edited
  // (installment scheduling, cancellation fee, calendar token) must not re-fire.
  if (after.status !== 'confirmed') return false;
  if (before?.status === 'confirmed') return false;
  if (!after.pricePaidCents || after.pricePaidCents <= 0) return false;
  // Match + catalog fields we can't send a useful event without.
  if (!after.sectionId || !after.email) return false;
  return true;
}

/**
 * The cents figure we report to Meta as `value`: the family's full committed
 * tuition.
 *
 * Falls back to the registration-time charge for documents reserved before
 * `totalCommittedCents` existed — under-reporting an old record beats skipping
 * its conversion entirely. Pay-in-full registrations are unaffected either way,
 * since for them the two fields are equal by construction.
 */
export function reportedValueCents(
  data: MusicTogetherConversionData
): number {
  const committed = data.totalCommittedCents;
  if (typeof committed === 'number' && committed > 0) return committed;
  return data.pricePaidCents ?? 0;
}

/** Build the Meta CAPI `Purchase` event for a confirmed MT registration. */
export function buildMusicTogetherPurchaseEvent(
  registrationId: string,
  data: MusicTogetherConversionData
): MetaCapiEvent {
  const isInstallments = data.paymentPlan === 'installments';
  // Best-effort, and deliberately conservative: `parseUsAddress` returns only
  // the parts it can identify unambiguously. A wrong city hash is worse than
  // no city — it matches nobody while looking like a supplied match key.
  const { city, state, zip } = parseUsAddress(data.address);
  return {
    eventName: 'Purchase',
    // The MT widget fires no browser Pixel `Purchase`, so there is nothing to
    // collapse against today. Still send a stable, idempotent id (the
    // registration doc id) so a duplicate trigger delivery counts once and a
    // future browser-side MT Pixel event can dedup against it.
    eventId: `mt-${registrationId}`,
    actionSource: 'website',
    eventSourceUrl: data.eventSourceUrl || undefined,
    user: {
      email: data.email,
      phone: data.phone || undefined,
      firstName: data.adultFirstName || undefined,
      lastName: data.adultLastName || undefined,
      city,
      state,
      zip,
      // Every MT family is local. Known without asking, so always sent.
      country: 'us',
      // Lowercased email as our cross-surface person id (hashed before send),
      // matching what the demo-RSVP and interest events use — that is what
      // lets Meta stitch one family's whole funnel together.
      externalId: data.email?.trim().toLowerCase() || undefined,
      fbp: data.fbp || undefined,
      fbc: data.fbc || undefined,
      ip: data.clientIp || undefined,
      userAgent: data.clientUserAgent || undefined,
    },
    customData: {
      currency: 'USD',
      // Dollars, not cents — Meta's `value` is currency-major. The family's
      // FULL committed tuition (see the value-semantics note at the top of this
      // file before changing this).
      value: Math.round(reportedValueCents(data)) / 100,
      // Section doc id keeps MT consistent with how class purchases key to the
      // class doc id.
      content_ids: [data.sectionId],
      content_type: 'product',
      content_category: 'music_together',
      // One MT registration is one family enrollment, regardless of how many
      // children are on it — children don't multiply the ad conversion.
      num_items: 1,
      payment_plan: isInstallments ? 'installments' : 'full',
      scheduled_charge_count: data.scheduledChargeCount ?? 0,
      // Cash actually collected at registration. `value` is the committed
      // total, so this is what keeps the timing story legible in Events
      // Manager: for an installment family it is installment 1, and for a
      // pay-in-full family it equals `value`.
      amount_paid_today: Math.round(data.pricePaidCents ?? 0) / 100,
    },
  };
}

/**
 * Core emit logic, decoupled from the Firestore-trigger wrapper so it is
 * unit-testable without the functions test harness. Best-effort: never throws.
 * Returns whether an event was sent.
 */
export async function emitMusicTogetherPurchaseIfConfirmed(
  registrationId: string,
  before: MusicTogetherConversionData | undefined,
  after: MusicTogetherConversionData | undefined,
  send: (event: MetaCapiEvent) => Promise<void>,
  logger: Pick<Console, 'log' | 'error'> = console
): Promise<boolean> {
  if (!shouldEmitMusicTogetherPurchase(before, after)) return false;
  const data = after as MusicTogetherConversionData;
  try {
    await send(buildMusicTogetherPurchaseEvent(registrationId, data));
    logger.log(
      'Sent Meta CAPI Purchase for confirmed Music Together registration',
      {
        registrationId,
        committedCents: reportedValueCents(data),
        paidTodayCents: data.pricePaidCents,
        paymentPlan: data.paymentPlan,
      }
    );
    return true;
  } catch (err) {
    logger.error('Meta CAPI Music Together Purchase send failed', err);
    return false;
  }
}

export const sendMusicTogetherConversion = onDocumentWritten(
  {
    document: 'musicTogetherRegistrations/{registrationId}',
    region: 'us-east4',
    secrets: [metaCapiToken],
  },
  async (event) => {
    const change = event.data as Change<DocumentSnapshot> | undefined;
    if (!change) return;

    const before = change.before?.exists
      ? (change.before.data() as MusicTogetherConversionData)
      : undefined;
    const after = change.after?.exists
      ? (change.after.data() as MusicTogetherConversionData)
      : undefined;

    const config: MetaCapiConfig = {
      baseUrl: metaCapiBaseUrl.value(),
      apiVersion: metaCapiApiVersion.value(),
      pixelId: metaPixelId.value(),
      accessToken: metaCapiToken.value(),
    };

    await emitMusicTogetherPurchaseIfConfirmed(
      event.params.registrationId,
      before,
      after,
      async (evt) => {
        await trySendMetaCapiEvents(config, [evt]);
      }
    );
  }
);
