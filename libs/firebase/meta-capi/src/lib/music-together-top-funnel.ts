/**
 * Music Together top-of-funnel Conversions API events.
 *
 * The two conversions this covers — a free demo RSVP (`Schedule`) and an
 * interest-list signup (`Lead`) — are the only ones with enough volume for the
 * MT ad account to ever optimize against. Paid enrollment happens weeks later
 * and in single digits, so `Purchase` alone can never train a bidder.
 *
 * Both events have a browser twin in
 * `apps/webflow-components/src/lib/music-together-analytics.ts`. This module is
 * the single definition of the shared `event_id`, so the two halves cannot
 * drift the way they could if each side formatted its own: the server computes
 * the id, persists nothing, and hands it back in the callable response for the
 * widget to pass as the Pixel's `eventID`.
 *
 * ## Why the id is a hash and not the document id
 *
 * `mt-<registrationId>` works for enrollments because a Firestore auto-id is
 * meaningless outside our database. It does NOT work here: both of these
 * collections are keyed by the family's LOWERCASED EMAIL for idempotency
 * (`musicTogetherDemos/{demoId}/rsvps/{email}`,
 * `musicTogetherInterest/{email}`), so `mt-demo-<docId>` would ship a
 * plaintext email address to Meta in an unhashed field — the exact thing the
 * rest of this library exists to prevent.
 *
 * The id is therefore a truncated SHA-256 over the same inputs. It keeps every
 * property that matters: stable across the browser/server pair, unique per
 * (demo, family) and per family, derivable from the stored document alone (so
 * this can be promoted to a Firestore trigger later without changing the wire
 * format), and carrying no PII.
 */
import { createHash } from 'crypto';
import type { MetaCapiEvent } from './meta-capi';

/** Booking a specific demo time is stronger intent than joining a list… */
export const MT_DEMO_RSVP_EVENT_NAME = 'Schedule';
/** …so the two campaigns bid toward separate events. Do not merge them. */
export const MT_INTEREST_EVENT_NAME = 'Lead';

/** Every US form we run. Sent unconditionally — we know it without asking. */
export const MT_DEFAULT_COUNTRY = 'us';

/**
 * Tighter than the library's 5s default, because these two sends sit INLINE on
 * a user-facing form submit rather than on a background trigger.
 *
 * A family watching a spinner should never wait five seconds on a marketing
 * beacon. Two seconds is comfortably above Graph API's normal response time
 * from us-east4 while capping the worst case at something a form submit can
 * absorb — and `trySendMetaCapiEvents` swallows the abort, so a slow Meta costs
 * us one attribution event and nothing else.
 */
export const MT_TOP_FUNNEL_CAPI_TIMEOUT_MS = 2_000;

/** 16 hex chars: ~64 bits, far past collision risk at our volume, and short
 *  enough to stay readable in Events Manager. */
function shortHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

/** Normalize an email to the same key the repositories use as a document id. */
export function mtEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Dedup key for a demo RSVP. Scoped by demo so a family that RSVPs to a second
 * demo produces a second, genuinely distinct conversion.
 */
export function musicTogetherDemoRsvpEventId(
  demoId: string,
  email: string
): string {
  return `mt-demo-${shortHash(`${demoId}:${mtEmailKey(email)}`)}`;
}

/** Dedup key for an interest-list signup. One family, one id, forever. */
export function musicTogetherInterestEventId(email: string): string {
  return `mt-interest-${shortHash(mtEmailKey(email))}`;
}

/**
 * Browser + request context captured at submit time, persisted on the document
 * and forwarded to Meta.
 *
 * `fbc` is the single strongest signal here — it is the literal ad click.
 * Without it Meta falls back to matching on the email hash alone, which is what
 * keeps Events Manager match quality low.
 */
export interface MusicTogetherSignalContext {
  fbp?: string | null;
  fbc?: string | null;
  eventSourceUrl?: string | null;
  clientIp?: string | null;
  clientUserAgent?: string | null;
}

export interface MusicTogetherDemoRsvpEventInput extends MusicTogetherSignalContext {
  demoId: string;
  email: string;
  /** Family name as typed; split into `fn` / `ln` by the caller's `splitName`. */
  firstName?: string;
  lastName?: string;
  /** ISO instant of the demo class, for reporting in Events Manager. */
  demoDateTime?: string;
  /** A full demo puts the family on the waitlist — still intent, not a seat. */
  rsvpStatus: 'confirmed' | 'waitlisted';
}

export interface MusicTogetherInterestEventInput extends MusicTogetherSignalContext {
  email: string;
  firstName?: string;
  lastName?: string;
  /** Section ids the family checked off; may be empty (notes-only signup). */
  interestedSectionIds: string[];
}

/** Fields every MT top-funnel event shares. */
function baseUser(input: MusicTogetherSignalContext & {
  email: string;
  firstName?: string;
  lastName?: string;
}) {
  return {
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    // Known unconditionally — every one of these forms is a US local business
    // form. A country hash costs nothing and lifts match quality.
    country: MT_DEFAULT_COUNTRY,
    // The lowercased email doubles as our cross-surface person id, so a demo
    // RSVP and a later enrollment resolve to the same person for Meta.
    externalId: mtEmailKey(input.email),
    fbp: input.fbp || undefined,
    fbc: input.fbc || undefined,
    ip: input.clientIp || undefined,
    userAgent: input.clientUserAgent || undefined,
  };
}

/** `Schedule` for a free demo RSVP (or a full-demo waitlist join). */
export function buildMusicTogetherDemoRsvpEvent(
  input: MusicTogetherDemoRsvpEventInput
): MetaCapiEvent {
  return {
    eventName: MT_DEMO_RSVP_EVENT_NAME,
    eventId: musicTogetherDemoRsvpEventId(input.demoId, input.email),
    actionSource: 'website',
    eventSourceUrl: input.eventSourceUrl || undefined,
    user: baseUser(input),
    customData: {
      // Mirrors `buildDemoRsvpPixelEvent` in music-together-analytics.ts. The
      // two payloads do not have to match for deduplication (only the id and
      // event name do), but keeping them aligned means Events Manager reads the
      // same whichever half survived.
      content_name: 'music-together-demo',
      content_category: 'music_together_demo',
      content_ids: [input.demoId],
      content_type: 'product',
      ...(input.demoDateTime ? { demo_date_time: input.demoDateTime } : {}),
      rsvp_status: input.rsvpStatus,
    },
  };
}

/** `Lead` for a cross-section interest-list signup. */
export function buildMusicTogetherInterestEvent(
  input: MusicTogetherInterestEventInput
): MetaCapiEvent {
  return {
    eventName: MT_INTEREST_EVENT_NAME,
    eventId: musicTogetherInterestEventId(input.email),
    actionSource: 'website',
    eventSourceUrl: input.eventSourceUrl || undefined,
    user: baseUser(input),
    customData: {
      content_name: 'music-together-interest',
      content_category: 'music_together_interest',
      content_ids: input.interestedSectionIds,
      content_type: 'product',
      // The server event only ever fires for a NEW entry (see the callables),
      // so this is always false here. Sent anyway so the field set matches the
      // browser event, which does fire on re-submits.
      already_on_list: false,
    },
  };
}
