/**
 * Meta Conversions API (server-side) helper.
 *
 * Shared by every Cloud Function that sends server-side events to Meta:
 * `tallyLeadWebhook`'s `Lead`, confirmed class registrations' `Purchase`
 * (`sendRegistrationConversion`), and confirmed Music Together registrations'
 * `Purchase` (`sendMusicTogetherConversion`).
 *
 * Music Together reports into its OWN pixel from its own ad account, so the
 * pixel is a per-call `MetaCapiConfig` field rather than a module constant —
 * callers pick the dataset (see `resolveFormAttribution` in
 * `tally-lead-webhook.ts` and `META_PIXEL_ID_MUSIC_TOGETHER`).
 *
 * Why server-side at all: the browser Pixel is silently dropped by iOS/Safari
 * ITP and ad blockers, and never fires on flows that redirect off-site (e.g.
 * the Square-hosted checkout fallback). A server event survives that loss and,
 * via a shared `event_id`, is deduplicated against the browser Pixel so a
 * conversion tracked both ways is counted once.
 *
 * All PII (email, phone, name) is SHA-256 hashed before it leaves us, per
 * Meta's requirement.
 *
 * @see https://developers.facebook.com/docs/marketing-api/conversions-api
 */
import { createHash } from 'crypto';

export interface MetaCapiConfig {
  /** e.g. https://graph.facebook.com */
  baseUrl: string;
  /** e.g. v20.0 */
  apiVersion: string;
  pixelId: string;
  accessToken: string;
  /**
   * Abort the POST after this many ms. `fetch` has no default timeout, so a
   * hung Graph API connection otherwise stalls the caller until the function
   * itself times out — on a webhook with a short delivery budget that turns a
   * slow beacon into a dropped event. Defaults to 5s.
   */
  timeoutMs?: number;
}

/** @see MetaCapiConfig.timeoutMs */
export const DEFAULT_META_CAPI_TIMEOUT_MS = 5_000;

export interface MetaCapiUserIdentifiers {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  /** Meta browser-id cookie (`_fbp`) — lifts match quality when present. */
  fbp?: string;
  /** Meta click-id cookie (`_fbc`) — the strongest ad-click match signal. */
  fbc?: string;
  ip?: string;
  userAgent?: string;
}

export interface MetaCapiEvent {
  /** e.g. 'Purchase', 'Lead'. */
  eventName: string;
  /**
   * Deduplication key shared with the browser Pixel's `eventID`. When both the
   * Pixel and this server event carry the same id, Meta counts them once.
   */
  eventId?: string;
  eventSourceUrl?: string;
  actionSource?: 'website' | 'physical_store' | 'system_generated' | 'app';
  user: MetaCapiUserIdentifiers;
  customData?: Record<string, unknown>;
  /** Unix seconds; defaults to now at send time. */
  eventTimeSeconds?: number;
}

/** SHA-256 hex of a trimmed, lowercased value — Meta's hashing for em/fn/ln. */
export function hashNormalized(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

/**
 * Phone is hashed as digits only (drop spaces, punctuation, leading `+`).
 *
 * Meta requires the COUNTRY CODE to be included — a bare 10-digit NANP number
 * hashes to something their index has never seen, so it silently matches
 * nobody. Customers type `(304) 555-0199` far more often than `+1 …`, so
 * assume US/Canada for a 10-digit input.
 */
export function hashPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const withCountryCode = digits.length === 10 ? `1${digits}` : digits;
  return createHash('sha256').update(withCountryCode).digest('hex');
}

/**
 * Split a full name into first / last for Meta's `fn` / `ln` match fields.
 * Best-effort: first token is the first name, the remainder is the last name
 * so hyphenated and multi-part surnames survive intact.
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

/** Build Meta's `user_data` object, hashing every PII field. */
export function buildUserData(
  user: MetaCapiUserIdentifiers
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (user.email) data['em'] = [hashNormalized(user.email)];
  if (user.phone) {
    const digits = user.phone.replace(/\D/g, '');
    if (digits) data['ph'] = [hashPhone(user.phone)];
  }
  if (user.firstName) data['fn'] = [hashNormalized(user.firstName)];
  if (user.lastName) data['ln'] = [hashNormalized(user.lastName)];
  if (user.fbp) data['fbp'] = user.fbp;
  if (user.fbc) data['fbc'] = user.fbc;
  if (user.ip) data['client_ip_address'] = user.ip;
  if (user.userAgent) data['client_user_agent'] = user.userAgent;
  return data;
}

/** Serialize one event into the Graph API payload shape. */
export function buildCapiEvent(
  event: MetaCapiEvent,
  nowSeconds: number
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    event_name: event.eventName,
    event_time: event.eventTimeSeconds ?? nowSeconds,
    action_source: event.actionSource ?? 'website',
    user_data: buildUserData(event.user),
  };
  if (event.eventId) payload['event_id'] = event.eventId;
  if (event.eventSourceUrl) payload['event_source_url'] = event.eventSourceUrl;
  if (event.customData) payload['custom_data'] = event.customData;
  return payload;
}

/**
 * POST events to the Meta Conversions API. Throws on a non-2xx response so the
 * caller can log it — callers on a user-facing path should treat the send as
 * best-effort and never let a failure here break their own work.
 */
export async function sendMetaCapiEvents(
  config: MetaCapiConfig,
  events: MetaCapiEvent[],
  nowSeconds: number = Math.floor(Date.now() / 1000)
): Promise<void> {
  if (events.length === 0) return;
  const url = `${config.baseUrl}/${config.apiVersion}/${encodeURIComponent(
    config.pixelId
  )}/events?access_token=${encodeURIComponent(config.accessToken)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: events.map((e) => buildCapiEvent(e, nowSeconds)),
    }),
    signal: AbortSignal.timeout(
      config.timeoutMs ?? DEFAULT_META_CAPI_TIMEOUT_MS
    ),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Meta CAPI ${response.status}: ${text}`);
  }
}

/**
 * Fire-and-forget wrapper around {@link sendMetaCapiEvents}.
 *
 * A marketing beacon must NEVER be able to fail a checkout or retry-loop a
 * Firestore trigger: by the time we call this, the buyer's card is charged and
 * their seat is reserved. Every failure mode (bad config, network, Meta 5xx)
 * is swallowed and logged.
 *
 * @returns `true` when Meta accepted the batch, `false` when it was skipped or failed.
 */
export async function trySendMetaCapiEvents(
  config: MetaCapiConfig | undefined,
  events: MetaCapiEvent[],
  logger: Pick<Console, 'warn' | 'error'> = console
): Promise<boolean> {
  try {
    if (!config?.pixelId || !config?.accessToken) {
      logger.warn(
        'Meta CAPI not configured (missing pixel id or access token) — skipping events',
        { eventNames: events.map((e) => e.eventName) }
      );
      return false;
    }
    await sendMetaCapiEvents(config, events);
    return true;
  } catch (err) {
    logger.error('Meta CAPI send failed (caller unaffected)', err);
    return false;
  }
}
