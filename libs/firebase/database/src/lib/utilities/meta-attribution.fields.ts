/**
 * Meta ad-attribution fields, as PERSISTED on a conversion document.
 *
 * Registrations have carried these since the Conversions API work
 * (`registration-reservation.utility.ts`, `create-music-together-registration.ts`
 * both write the same five keys inline). This module gives the top-of-funnel
 * collections — demo RSVPs and interest signups — the identical shape, so every
 * conversion document in the database answers "which ad click produced this?"
 * the same way.
 *
 * Two properties are load-bearing:
 *
 *  - **Written as explicit `null`, never omitted.** A stable field set means a
 *    query or a backfill can tell "we captured nothing" apart from "this
 *    document predates the feature", and it keeps the shape identical across
 *    the paths that do and don't receive attribution.
 *  - **Advisory only.** Every value here is client-supplied and trivially
 *    forged. Never authorize, price, or gate anything on it.
 */

/** What a caller passes in — usually straight off the request. */
export interface MetaAttributionInput {
  /** `_fbp` first-party browser cookie written by the Meta Pixel. */
  fbp?: string | null;
  /** `_fbc` click cookie, or one synthesized from an `fbclid` query param. */
  fbc?: string | null;
  /** Page the family converted on, query string stripped. */
  eventSourceUrl?: string | null;
  /** Caller IP, from the callable's request context (not the client payload). */
  clientIp?: string | null;
  /** Caller user agent, likewise from the request context. */
  clientUserAgent?: string | null;
}

/** What lands in Firestore: the same five keys, always present. */
export interface MetaAttributionFields {
  fbp: string | null;
  fbc: string | null;
  eventSourceUrl: string | null;
  clientIp: string | null;
  clientUserAgent: string | null;
}

/**
 * Normalize attribution for persistence, optionally falling back to what is
 * already on the document.
 *
 * `existing` matters for the idempotent upserts: a family re-submitting the
 * interest form from a bookmark has no `_fbc`, and blanking the click id we
 * captured on their original ad-driven visit would throw away the only thing
 * linking them to a campaign. A fresh value always wins; an absent one keeps
 * whatever we had.
 */
export function toMetaAttributionFields(
  input?: MetaAttributionInput,
  existing?: MetaAttributionInput
): MetaAttributionFields {
  const pick = (key: keyof MetaAttributionInput): string | null =>
    input?.[key] || existing?.[key] || null;
  return {
    fbp: pick('fbp'),
    fbc: pick('fbc'),
    eventSourceUrl: pick('eventSourceUrl'),
    clientIp: pick('clientIp'),
    clientUserAgent: pick('clientUserAgent'),
  };
}
