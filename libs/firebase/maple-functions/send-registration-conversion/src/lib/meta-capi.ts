/**
 * Meta Conversions API (server-side) helper.
 *
 * Shared by any Cloud Function that sends server-side events to Meta — the
 * Tally webhook's `Lead` and confirmed class registrations' `Purchase`.
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
}

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

/** Phone is hashed as digits only (drop spaces, punctuation, leading `+`). */
export function hashPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return createHash('sha256').update(digits).digest('hex');
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
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Meta CAPI ${response.status}: ${text}`);
  }
}
