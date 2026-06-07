/**
 * Catalog Sync Request Repository
 *
 * Singleton document at `catalogSyncRequests/pending` that coordinates
 * deferred catalog syncs from Square webhooks. The webhook handler must
 * ack within Square's 10-second timeout, so it just bumps `requestedAt`
 * here and returns 200. A Firestore-triggered function (`processCatalog
 * SyncRequest`) drains the request asynchronously.
 *
 * Lease semantics let a burst of N webhook events collapse to a single
 * downstream sync: only the first trigger to claim the lease runs the
 * work, the rest exit fast. After a sync completes, the running=false
 * write re-fires the trigger; if any further requests arrived during
 * the sync (requestedAt > processedAt), the next invocation picks them
 * up. Otherwise it exits.
 *
 * The lease has a TTL so a crashed processor doesn't permanently block
 * later syncs.
 */
import admin from 'firebase-admin';
import { db, toDate } from './utilities/database.config';

const COLLECTION = 'catalogSyncRequests';
const DOC_ID = 'pending';

/** A stale lease is one whose holder hasn't checked in within this window. */
export const LEASE_TTL_MS = 5 * 60 * 1000;

export interface CatalogSyncRequest {
  requestedAt?: Date;
  processedAt?: Date;
  running: boolean;
  lastStartedAt?: Date;
  lastResult?: string;
  lastError?: string;
}

function docToRequest(
  doc: FirebaseFirestore.DocumentSnapshot
): CatalogSyncRequest {
  if (!doc.exists) {
    return { running: false };
  }
  const data = doc.data()!;
  return {
    requestedAt: data['requestedAt'] ? toDate(data['requestedAt']) : undefined,
    processedAt: data['processedAt'] ? toDate(data['processedAt']) : undefined,
    running: Boolean(data['running']),
    lastStartedAt: data['lastStartedAt']
      ? toDate(data['lastStartedAt'])
      : undefined,
    lastResult: data['lastResult'],
    lastError: data['lastError'],
  };
}

function docRef(): FirebaseFirestore.DocumentReference {
  return db.collection(COLLECTION).doc(DOC_ID);
}

export const CatalogSyncRequestRepository = {
  /**
   * Called by the webhook handler. Bumps `requestedAt` to the current
   * server time; merges so we don't clobber lease/processed state.
   */
  async requestRefresh(): Promise<void> {
    await docRef().set(
      { requestedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
  },

  /**
   * Atomic lease acquisition. Returns true if the caller now holds the
   * lease and should run the sync, false otherwise. Re-checks every
   * condition inside the transaction so two concurrent triggers can't
   * both think they own the lease.
   */
  async tryClaimLease(now: Date = new Date()): Promise<boolean> {
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef());
      const cur = docToRequest(snap);

      // Lease in flight and not stale → bail
      if (
        cur.running &&
        cur.lastStartedAt &&
        now.getTime() - cur.lastStartedAt.getTime() < LEASE_TTL_MS
      ) {
        return false;
      }

      // Nothing new to do
      if (
        cur.processedAt &&
        cur.requestedAt &&
        cur.processedAt.getTime() >= cur.requestedAt.getTime()
      ) {
        return false;
      }

      // No request ever recorded → nothing to do
      if (!cur.requestedAt) {
        return false;
      }

      tx.set(
        snap.ref,
        {
          running: true,
          lastStartedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastError: admin.firestore.FieldValue.delete(),
        },
        { merge: true }
      );
      return true;
    });
  },

  /** Release the lease and record success. */
  async markCompleted(summary: string): Promise<void> {
    await docRef().set(
      {
        running: false,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastResult: summary,
      },
      { merge: true }
    );
  },

  /** Release the lease and record failure (does not advance processedAt). */
  async markFailed(error: string): Promise<void> {
    await docRef().set(
      {
        running: false,
        lastError: error,
      },
      { merge: true }
    );
  },

  /** Read current state (used by the trigger to make a cheap pre-claim check). */
  async getCurrent(): Promise<CatalogSyncRequest> {
    const snap = await docRef().get();
    return docToRequest(snap);
  },
};
