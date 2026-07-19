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
 * hosted-checkout hold. The `!squarePaymentId` guard avoids racing a payment
 * that is confirming right now.
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
      .get();

    if (snapshot.empty) {
      console.log('[release-stale-holds] no stale pending holds');
      return;
    }

    const batch = db.batch();
    let released = 0;
    for (const doc of snapshot.docs) {
      // Never cancel a hold that already has a payment recorded — that's a race
      // with the confirming webhook, not an abandoned checkout.
      if (doc.data().squarePaymentId) continue;
      batch.update(doc.ref, {
        status: 'cancelled',
        notes: `Abandoned checkout — hold released after ${HOLD_TTL_MINUTES} minutes`,
        updatedAt: now,
      });
      released++;
    }

    if (released > 0) {
      await batch.commit();
    }
    console.log(
      `[release-stale-holds] released ${released} of ${snapshot.size} stale pending hold(s)`
    );
  }
);
