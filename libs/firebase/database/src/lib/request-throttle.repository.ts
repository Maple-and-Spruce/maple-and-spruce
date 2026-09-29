/**
 * Request Throttle Repository
 *
 * Fixed-window request counters for public callables (ADR-034). One document
 * per `(bucket, window)`; the caller hands in an already-hashed bucket id, so
 * nothing identifying (an email, an IP) is ever stored here.
 *
 * Every read is a document-id `get` inside a transaction, so no composite index
 * is needed. `expiresAt` exists for a Firestore TTL policy on this collection
 * group, which deletes spent windows; nothing reads it.
 */
import { getDb } from './utilities/database.config';

const COLLECTION = 'requestThrottles';

/** How long a spent window's document lingers before TTL may delete it. */
export const REQUEST_THROTTLE_RETENTION_MS = 60 * 60 * 1000;

export interface RequestThrottleHit {
  /** False once this hit takes the window's count past `limit`. */
  allowed: boolean;
  /** The count including this hit. */
  count: number;
}

/** Start of the fixed window `now` falls in, in epoch ms. */
export function throttleWindowStart(
  now: number,
  windowSeconds: number
): number {
  const windowMs = windowSeconds * 1000;
  return Math.floor(now / windowMs) * windowMs;
}

export const RequestThrottleRepository = {
  /**
   * Count one request against `bucketId` in the current window.
   *
   * Increments even past the limit, so a caller that keeps going stays over
   * it until the window rolls, and the count shows how far over it went.
   */
  async hit(
    bucketId: string,
    limit: number,
    windowSeconds: number,
    now: number = Date.now()
  ): Promise<RequestThrottleHit> {
    const windowStart = throttleWindowStart(now, windowSeconds);
    const ref = getDb()
      .collection(COLLECTION)
      .doc(`${bucketId}:${windowStart}`);

    return getDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const previous = snap.exists ? Number(snap.data()?.['count'] ?? 0) : 0;
      const count = previous + 1;
      tx.set(ref, {
        count,
        windowStart: new Date(windowStart),
        expiresAt: new Date(
          windowStart + windowSeconds * 1000 + REQUEST_THROTTLE_RETENTION_MS
        ),
      });
      return { allowed: count <= limit, count };
    });
  },
};
