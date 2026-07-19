/**
 * Release Stale Registration Holds — scheduled reaper.
 *
 * A hosted-checkout Payment Link reserves a class spot by writing a `pending`
 * registration, then hands the buyer a Square-hosted checkout URL. If the buyer
 * abandons that page, the `pending` registration would hold the spot forever
 * (capacity counts `pending` + `confirmed`), silently shrinking availability on
 * a near-full class.
 *
 * This reaper runs every 5 minutes and cancels `pending` registrations older
 * than the hold TTL that carry no Square payment — releasing the spot. The
 * inline card flow resolves `pending` within a single request, and POS sales
 * are written `confirmed`, so a lingering `pending` is always an abandoned
 * hosted-checkout hold.
 *
 * Concurrency: each hold is cancelled inside a transaction that RE-READS the
 * doc, so a payment that confirms the registration between the query and the
 * write is never clobbered (the query snapshot is stale by the time we commit).
 * The cancellation reason goes in a dedicated `holdReleaseReason` field, NOT
 * `notes`, so the buyer's own note survives if a late payment later resurrects
 * the hold (see process-pos-sale reconciliation). The query is bounded so a
 * large backlog can't exceed Firestore's per-commit write limit.
 *
 * Deployed to us-east4 (maple-core codebase) via CI/CD.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getDb } from '@maple/firebase/database';

/**
 * How long a `pending` hosted-checkout hold may live before it's treated as
 * abandoned. Long enough for a real buyer to finish on Square's hosted page,
 * short enough not to block a near-full class for long.
 */
const HOLD_TTL_MINUTES = 15;

/**
 * Max holds processed per run. Bounds work (and Firestore round-trips) so a
 * backlog can't blow up a single run; the next 5-minute run drains the rest.
 */
const MAX_PER_RUN = 300;

/**
 * Cancel one hold transactionally, re-reading inside the transaction so a
 * payment that confirmed the registration after the query snapshot is never
 * clobbered. Returns whether it actually released the hold.
 */
async function releaseHoldIfStale(
  txn: FirebaseFirestore.Transaction,
  ref: FirebaseFirestore.DocumentReference,
  now: Date
): Promise<boolean> {
  const fresh = await txn.get(ref);
  const data = fresh.data();
  if (!data || data.status !== 'pending' || data.squarePaymentId) {
    return false;
  }
  txn.update(ref, {
    status: 'cancelled',
    // Reason lives in its own field so the buyer's `notes` are preserved if a
    // late payment resurrects this hold.
    holdReleaseReason: `Abandoned checkout — hold released after ${HOLD_TTL_MINUTES} minutes`,
    updatedAt: now,
  });
  return true;
}

export const releaseStaleRegistrationHolds = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'America/New_York',
    region: 'us-east4',
  },
  async () => {
    const db = getDb();
    const now = new Date();
    const cutoff = new Date(now.getTime() - HOLD_TTL_MINUTES * 60 * 1000);

    const snapshot = await db
      .collection('registrations')
      .where('status', '==', 'pending')
      .where('createdAt', '<', cutoff)
      .limit(MAX_PER_RUN)
      .get();

    if (snapshot.empty) {
      console.log('[release-stale-holds] no stale pending holds');
      return;
    }

    let released = 0;
    for (const doc of snapshot.docs) {
      // Cancel transactionally so we never overwrite a registration a
      // concurrent webhook confirmed (and paid) after the query snapshot.
      const didRelease = await db.runTransaction((txn) =>
        releaseHoldIfStale(txn, doc.ref, now)
      );
      if (didRelease) released++;
    }

    console.log(
      `[release-stale-holds] released ${released} of ${snapshot.size} stale pending hold(s)`
    );
  }
);
