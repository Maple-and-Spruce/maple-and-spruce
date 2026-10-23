/**
 * Send Registration Conversion Cloud Function
 *
 * Firestore trigger that fires a Meta Conversions API `Purchase` and a GA4
 * Measurement Protocol `purchase` when a class registration becomes
 * `confirmed`.
 *
 * Why this exists: the browser Pixel's `Purchase` (fired inline by the
 * registration widget) is silently dropped by iOS/Safari ITP and ad blockers,
 * and never fires at all on the Square-hosted checkout fallback (which redirects
 * off-site). Both inline and hosted paths converge on the same
 * `registrations/{id}` doc flipping `status: pending -> confirmed`, so a single
 * trigger on that transition recovers every confirmed purchase server-side.
 *
 * Dedup: the Meta event carries `event_id = confirmationNumber`, the same id
 * the inline Pixel sends as `eventID`, so a purchase tracked both ways counts
 * once.
 *
 * GA4: this server event is the ONLY GA4 `purchase`. The widget also pushes a
 * `purchase` to the dataLayer, but GTM must not forward that one to GA4 or
 * every sale would count twice (see #27). The browser's `_ga` client id and
 * session id ride along on the registration so GA4 credits the sale to the
 * session, and channel, the buyer arrived in.
 *
 * MailerLite: the same sale is recorded as an order in the MailerLite shop, so
 * each newsletter campaign shows the registrations and revenue it earned
 * (#262). MailerLite credits the order to a campaign when the buyer arrived
 * through a tracked link; the order itself carries only the email. It is off
 * until `MAILERLITE_SHOP_ID` is set.
 *
 * Best-effort by design: a failure on any beacon is logged and swallowed —
 * a dropped conversion must never retry-loop or affect the registration itself.
 */
import {
  onDocumentWritten,
  type Change,
  type DocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import {
  splitName,
  trySendMetaCapiEvents,
  type MetaCapiConfig,
  type MetaCapiEvent,
} from '@maple/firebase/meta-capi';
import {
  tryRecordOrder,
  type MailerLiteConfig,
  type MailerLiteOrder,
  type MailerLiteProduct,
} from '@maple/firebase/mailerlite';
import { ClassRepository } from '@maple/firebase/database';

// Reuses the same secret + string params as `tallyLeadWebhook`, so no new
// Secret Manager value or .env entry is required.
const metaCapiToken = defineSecret('META_CAPI_TOKEN');
const ga4ApiSecret = defineSecret('GA4_API_SECRET');
const ga4MeasurementId = defineString('GA4_MEASUREMENT_ID', {
  default: 'G-TY0E9X31V6',
});
const ga4BaseUrl = defineString('GA4_BASE_URL', {
  default: 'https://www.google-analytics.com',
});
const metaPixelId = defineString('META_PIXEL_ID', {
  default: '1625932185289127',
});
const metaCapiBaseUrl = defineString('META_CAPI_BASE_URL', {
  default: 'https://graph.facebook.com',
});
const metaCapiApiVersion = defineString('META_CAPI_API_VERSION', {
  default: 'v20.0',
});
const mailerLiteApiKey = defineSecret('MAILERLITE_API_KEY');
// Empty turns the MailerLite order off, so the trigger deploys safely before
// the shop exists. Dev and prod use different shops in the one shared account.
const mailerLiteShopId = defineString('MAILERLITE_SHOP_ID', { default: '' });
const mailerLiteBaseUrl = defineString('MAILERLITE_BASE_URL', {
  default: 'https://connect.mailerlite.com',
});

/** The subset of registration fields this trigger reads. */
export interface RegistrationConversionData {
  classId?: string;
  customerEmail?: string;
  customerName?: string;
  customerPhone?: string | null;
  quantity?: number;
  pricePaidCents?: number;
  confirmationNumber?: string;
  source?: string;
  status?: string;
  /** Attribution cookies, persisted at reservation time when available. */
  fbp?: string | null;
  fbc?: string | null;
  /** Class page URL the registration was made from, when captured. */
  eventSourceUrl?: string | null;
  /**
   * Browser context captured by the callable from the HTTP request. Meta uses
   * IP + user agent for probabilistic matching, which materially lifts match
   * quality when `_fbc` is absent.
   */
  clientIp?: string | null;
  clientUserAgent?: string | null;
  /** GA4 `_ga` client id and current session id, captured by the widget. */
  gaClientId?: string | null;
  gaSessionId?: string | null;
}

// `splitName` now lives in @maple/firebase/meta-capi; re-exported so existing
// importers of this module keep working.
export { splitName };

/**
 * Decide whether a registration write should emit a `Purchase`.
 *
 * Fires exactly once, on the (created-or-pending) -> `confirmed` transition, and
 * only for a paid **web** registration — in-person POS sales aren't ad-driven,
 * and a $0 record (free class / fully-discounted) isn't a purchase.
 */
export function shouldEmitPurchase(
  before: RegistrationConversionData | undefined,
  after: RegistrationConversionData | undefined,
): boolean {
  if (!after) return false;
  // Only when it just became confirmed — an already-confirmed doc being edited
  // (refund, reminder timestamp, etc.) must not re-fire.
  if (after.status !== 'confirmed') return false;
  if (before?.status === 'confirmed') return false;
  // In-person POS registrations aren't web-ad conversions.
  if (after.source && after.source !== 'web') return false;
  if (!after.pricePaidCents || after.pricePaidCents <= 0) return false;
  // Match + catalog fields we can't send a useful event without.
  if (!after.classId || !after.customerEmail) return false;
  return true;
}

/** Build the Meta CAPI `Purchase` event for a confirmed registration. */
export function buildPurchaseEvent(
  data: RegistrationConversionData,
): MetaCapiEvent {
  const { firstName, lastName } = splitName(data.customerName);
  return {
    eventName: 'Purchase',
    // Dedup against the inline browser Pixel, which sends the same value as
    // its `eventID`.
    eventId: data.confirmationNumber || undefined,
    actionSource: 'website',
    eventSourceUrl: data.eventSourceUrl || undefined,
    user: {
      email: data.customerEmail,
      phone: data.customerPhone || undefined,
      firstName,
      lastName,
      // Known unconditionally — this is a Morgantown, WV local business and
      // every one of these forms is a US form. Meta indexes `country` as its
      // own hashed match key, so sending it costs nothing and lifts match
      // quality on every event.
      country: 'us',
      // Lowercased email as our cross-surface person id. Hashed before send.
      // Using the SAME value on every surface is what lets Meta resolve one
      // family's demo RSVP, interest signup, and enrollment to one person.
      externalId: data.customerEmail?.trim().toLowerCase() || undefined,
      fbp: data.fbp || undefined,
      fbc: data.fbc || undefined,
      ip: data.clientIp || undefined,
      userAgent: data.clientUserAgent || undefined,
    },
    customData: {
      currency: 'USD',
      value: Math.round(data.pricePaidCents ?? 0) / 100,
      // content_ids MUST be the Firestore class doc id to match the catalog
      // feed (see class-analytics.ts) and the inline Pixel's ViewContent.
      content_ids: [data.classId],
      content_type: 'product',
      num_items: data.quantity ?? 1,
    },
  };
}

/**
 * Core emit logic, decoupled from the Firestore-trigger wrapper so it is
 * unit-testable without the functions test harness. Sends a `Purchase` via
 * `send` when the write is a fresh confirmation. Best-effort: never throws —
 * a dropped conversion must not retry-loop or affect the registration.
 * Returns whether an event was sent.
 */
export async function emitPurchaseIfConfirmed(
  before: RegistrationConversionData | undefined,
  after: RegistrationConversionData | undefined,
  send: (event: MetaCapiEvent) => Promise<void>,
  logger: Pick<Console, 'log' | 'error'> = console,
): Promise<boolean> {
  if (!shouldEmitPurchase(before, after)) return false;
  const data = after as RegistrationConversionData;
  try {
    await send(buildPurchaseEvent(data));
    logger.log('Sent Meta CAPI Purchase for confirmed registration', {
      confirmationNumber: data.confirmationNumber,
      valueCents: data.pricePaidCents,
    });
    return true;
  } catch (err) {
    logger.error('Meta CAPI Purchase send failed', err);
    return false;
  }
}

/** GA4 Measurement Protocol settings for the `purchase` beacon. */
export interface Ga4Config {
  baseUrl: string;
  measurementId: string;
  apiSecret: string;
}

/** Request body for GA4's `/mp/collect` endpoint. */
export interface Ga4PurchasePayload {
  client_id: string;
  events: Array<{ name: 'purchase'; params: Record<string, unknown> }>;
}

/**
 * GA4 `fetch` ceiling. `fetch` has no default timeout, and a hung connection
 * would hold the trigger open for its whole timeout for a beacon we were going
 * to swallow anyway.
 */
export const GA4_TIMEOUT_MS = 4_000;

/** Build the GA4 Measurement Protocol `purchase` for a confirmed registration. */
export function buildGa4PurchasePayload(
  data: RegistrationConversionData,
): Ga4PurchasePayload {
  const value = Math.round(data.pricePaidCents ?? 0) / 100;
  const quantity = data.quantity && data.quantity > 0 ? data.quantity : 1;
  const params: Record<string, unknown> = {
    // The confirmation number: what staff and buyers already use to refer to
    // a registration, and the same id the browser dataLayer event carries.
    transaction_id: data.confirmationNumber,
    currency: 'USD',
    value,
    items: [
      {
        // Firestore class id, matching the browser view_item / add_to_cart
        // events so the item reports line up.
        item_id: data.classId,
        price: Math.round((value / quantity) * 100) / 100,
        quantity,
      },
    ],
    // Required for GA4 to treat the event as part of an engaged session.
    engagement_time_msec: 1,
  };
  // With the browser's session id GA4 attributes the purchase to that
  // session's source/medium; without it the sale lands unattributed.
  const sessionId = Number(data.gaSessionId);
  if (data.gaSessionId && Number.isFinite(sessionId)) {
    params['session_id'] = sessionId;
  }
  if (data.eventSourceUrl) params['page_location'] = data.eventSourceUrl;

  return {
    // GA4 requires a client id. Prefer the buyer's real one; otherwise derive a
    // stable server-side one from the confirmation number, so a trigger retry
    // reports the same "user" rather than inventing a new one each time.
    client_id: data.gaClientId || `server.${data.confirmationNumber}`,
    events: [{ name: 'purchase', params }],
  };
}

/** POST one payload to GA4. Throws on a non-2xx so the caller can log it. */
export async function sendGa4Payload(
  config: Ga4Config,
  payload: Ga4PurchasePayload,
): Promise<void> {
  const url = `${config.baseUrl}/mp/collect?measurement_id=${encodeURIComponent(
    config.measurementId,
  )}&api_secret=${encodeURIComponent(config.apiSecret)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(GA4_TIMEOUT_MS),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`GA4 ${response.status}: ${text}`);
  }
}

/**
 * GA4 twin of {@link emitPurchaseIfConfirmed}: same transition rule, never
 * throws. Returns whether a `purchase` was sent.
 */
export async function emitGa4PurchaseIfConfirmed(
  before: RegistrationConversionData | undefined,
  after: RegistrationConversionData | undefined,
  send: (payload: Ga4PurchasePayload) => Promise<void>,
  logger: Pick<Console, 'log' | 'error'> = console,
): Promise<boolean> {
  if (!shouldEmitPurchase(before, after)) return false;
  const data = after as RegistrationConversionData;
  try {
    await send(buildGa4PurchasePayload(data));
    logger.log('Sent GA4 purchase for confirmed registration', {
      confirmationNumber: data.confirmationNumber,
      valueCents: data.pricePaidCents,
      hasClientId: Boolean(data.gaClientId),
      hasSessionId: Boolean(data.gaSessionId),
    });
    return true;
  } catch (err) {
    logger.error('GA4 purchase send failed', err);
    return false;
  }
}

/** The MailerLite product and order for one confirmed registration. */
export interface MailerLiteSale {
  product: MailerLiteProduct;
  order: MailerLiteOrder;
}

/**
 * Build the MailerLite product (the class) and order for a confirmed
 * registration. `className` comes from the class doc; without it the product is
 * named after the class id, which MailerLite will show but still counts.
 */
export function buildMailerLiteSale(
  data: RegistrationConversionData,
  className?: string,
): MailerLiteSale {
  const total = Math.round(data.pricePaidCents ?? 0) / 100;
  const quantity = data.quantity && data.quantity > 0 ? data.quantity : 1;
  const unitPrice = Math.round((total / quantity) * 100) / 100;
  const classId = data.classId as string;
  return {
    product: {
      // Same id Meta's catalog and GA4's items use.
      resourceId: classId,
      name: className?.trim() || classId,
      price: unitPrice,
      url: data.eventSourceUrl || undefined,
    },
    order: {
      // The confirmation number, so a retry updates this order rather than
      // adding a second sale.
      resourceId: data.confirmationNumber as string,
      customerEmail: data.customerEmail as string,
      items: [{ productResourceId: classId, quantity, price: unitPrice }],
      totalPrice: total,
      status: 'complete',
    },
  };
}

/**
 * MailerLite twin of {@link emitPurchaseIfConfirmed}: same transition rule,
 * never throws. Skips when no shop is configured, and when there is no
 * confirmation number to key the order on (a retry could then double-count).
 * Returns whether an order was sent.
 */
export async function emitMailerLiteOrderIfConfirmed(
  before: RegistrationConversionData | undefined,
  after: RegistrationConversionData | undefined,
  shopConfigured: boolean,
  lookupClassName: (classId: string) => Promise<string | undefined>,
  record: (sale: MailerLiteSale) => Promise<boolean>,
  logger: Pick<Console, 'log' | 'error'> = console,
): Promise<boolean> {
  if (!shopConfigured) return false;
  if (!shouldEmitPurchase(before, after)) return false;
  const data = after as RegistrationConversionData;
  if (!data.confirmationNumber) return false;
  let className: string | undefined;
  try {
    className = await lookupClassName(data.classId as string);
  } catch (err) {
    // The name is cosmetic; the order still counts without it.
    logger.error('MailerLite: class lookup failed, using the class id', err);
  }
  try {
    return await record(buildMailerLiteSale(data, className));
  } catch (err) {
    logger.error('MailerLite order send failed', err);
    return false;
  }
}

export const sendRegistrationConversion = onDocumentWritten(
  {
    document: 'registrations/{registrationId}',
    region: 'us-east4',
    secrets: [metaCapiToken, ga4ApiSecret, mailerLiteApiKey],
  },
  async (event) => {
    const change = event.data as Change<DocumentSnapshot> | undefined;
    if (!change) return;

    const before = change.before?.exists
      ? (change.before.data() as RegistrationConversionData)
      : undefined;
    const after = change.after?.exists
      ? (change.after.data() as RegistrationConversionData)
      : undefined;

    const config: MetaCapiConfig = {
      baseUrl: metaCapiBaseUrl.value(),
      apiVersion: metaCapiApiVersion.value(),
      pixelId: metaPixelId.value(),
      accessToken: metaCapiToken.value(),
    };

    const ga4Config: Ga4Config = {
      baseUrl: ga4BaseUrl.value(),
      measurementId: ga4MeasurementId.value(),
      apiSecret: ga4ApiSecret.value(),
    };

    const mailerLiteConfig: MailerLiteConfig = {
      baseUrl: mailerLiteBaseUrl.value(),
      shopId: mailerLiteShopId.value(),
      apiKey: mailerLiteApiKey.value(),
    };

    // Independent beacons: none throws, and one being down must not hold
    // up or suppress another.
    await Promise.all([
      emitPurchaseIfConfirmed(before, after, async (evt) => {
        await trySendMetaCapiEvents(config, [evt]);
      }),
      emitGa4PurchaseIfConfirmed(before, after, (payload) =>
        sendGa4Payload(ga4Config, payload),
      ),
      emitMailerLiteOrderIfConfirmed(
        before,
        after,
        Boolean(mailerLiteConfig.shopId.trim()),
        async (classId) => (await ClassRepository.findById(classId))?.name,
        ({ product, order }) =>
          tryRecordOrder(mailerLiteConfig, [product], order),
      ),
    ]);
  },
);
