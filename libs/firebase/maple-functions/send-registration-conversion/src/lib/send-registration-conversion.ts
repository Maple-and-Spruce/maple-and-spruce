/**
 * Send Registration Conversion Cloud Function
 *
 * Firestore trigger that fires a Meta Conversions API `Purchase` when a class
 * registration becomes `confirmed`.
 *
 * Why this exists: the browser Pixel's `Purchase` (fired inline by the
 * registration widget) is silently dropped by iOS/Safari ITP and ad blockers,
 * and never fires at all on the Square-hosted checkout fallback (which redirects
 * off-site). Both inline and hosted paths converge on the same
 * `registrations/{id}` doc flipping `status: pending -> confirmed`, so a single
 * trigger on that transition recovers every confirmed purchase server-side.
 *
 * Dedup: the server event carries `event_id = confirmationNumber`, the same id
 * the inline Pixel sends as `eventID`, so a purchase tracked both ways counts
 * once.
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
  sendMetaCapiEvents,
  type MetaCapiConfig,
  type MetaCapiEvent,
} from './meta-capi';

// Reuses the same secret + string params as `tallyLeadWebhook` (also
// maple-core), so no new Secret Manager value or .env entry is required.
const metaCapiToken = defineSecret('META_CAPI_TOKEN');
const metaPixelId = defineString('META_PIXEL_ID', {
  default: '1625932185289127',
});
const metaCapiBaseUrl = defineString('META_CAPI_BASE_URL', {
  default: 'https://graph.facebook.com',
});
const metaCapiApiVersion = defineString('META_CAPI_API_VERSION', {
  default: 'v20.0',
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
}

/**
 * Split a full name into first / last for Meta's `fn` / `ln` match fields.
 * Best-effort: first token is the first name, the remainder is the last name.
 */
export function splitName(full?: string): {
  firstName?: string;
  lastName?: string;
} {
  const trimmed = full?.trim();
  if (!trimmed) return {};
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/**
 * Decide whether a registration write should emit a `Purchase`.
 *
 * Fires exactly once, on the (created-or-pending) -> `confirmed` transition, and
 * only for a paid **web** registration — in-person POS sales aren't ad-driven,
 * and a $0 record (free class / fully-discounted) isn't a purchase.
 */
export function shouldEmitPurchase(
  before: RegistrationConversionData | undefined,
  after: RegistrationConversionData | undefined
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
  data: RegistrationConversionData
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
      fbp: data.fbp || undefined,
      fbc: data.fbc || undefined,
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
  logger: Pick<Console, 'log' | 'error'> = console
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

export const sendRegistrationConversion = onDocumentWritten(
  {
    document: 'registrations/{registrationId}',
    region: 'us-east4',
    secrets: [metaCapiToken],
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

    await emitPurchaseIfConfirmed(before, after, (evt) =>
      sendMetaCapiEvents(config, [evt])
    );
  }
);
