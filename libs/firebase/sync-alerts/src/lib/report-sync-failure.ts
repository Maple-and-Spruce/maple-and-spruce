/**
 * Email the studio when a background sync to Webflow or Square fails.
 *
 * The Firestore-triggered syncs deliberately swallow their errors: a thrown
 * error makes Cloud Functions retry the trigger, and a flapping external API
 * would fan out into a tight loop. Before this helper, that meant a failed
 * sync was a console line nobody read, and the public site quietly kept stale
 * data (a class card with the old price, a demo with the wrong spot count).
 *
 * Each failure now queues a plain-text email to `ADMIN_ALERT_EMAIL` (Katie in
 * prod, `katie+dev@` in dev) through the `mail` collection, the same path the
 * POS-sale alerts use.
 *
 * **Throttled per sync and per record.** An outage would otherwise send one
 * email per edit or registration. The first failure for a given
 * `(source, entityId)` emails straight away; further failures for the same
 * pair within {@link ALERT_WINDOW_MS} are counted, not sent, and the count
 * goes out with the next email.
 *
 * **Never throws.** This runs inside the catch block of a trigger that must
 * not throw, so a failure to alert is logged and dropped.
 */
import { defineString } from 'firebase-functions/params';
import { getDb } from '@maple/firebase/database';
import { FirebaseProject } from '@maple/firebase/functions';

/**
 * Where alerts go. `.env.prod` (katie@…) and `.env.dev` (katie+dev@…). The
 * default is the prod inbox, so a missing value still reaches someone.
 */
const adminAlertEmail = defineString('ADMIN_ALERT_EMAIL', {
  default: 'katie@mapleandsprucefolkarts.com',
});

/** One email per sync per record per window. */
export const ALERT_WINDOW_MS = 6 * 60 * 60 * 1000;

/** Throttle state, one doc per `(source, entityId)`. */
export const SYNC_ALERTS_COLLECTION = 'syncFailureAlerts';

export interface SyncFailure {
  /** The Cloud Function that failed, e.g. `syncClassToWebflow`. */
  source: string;
  /** Where the data was going. */
  destination: 'Webflow' | 'Square';
  /** What failed to sync, as the studio would say it: `class`, `MT demo`. */
  entityType: string;
  /** Firestore document id of the record. */
  entityId: string;
  /**
   * A human label for the record, such as a class or section name. Never a
   * customer's name: these emails are fine to hold one, but the label also
   * lands in logs.
   */
  entityLabel?: string;
  /** What was thrown. */
  error: unknown;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/** Firestore doc ids can't contain `/`. */
function throttleDocId(source: string, entityId: string): string {
  return `${source}__${entityId}`.replace(/\//g, '_');
}

export function buildSyncFailureEmail(
  failure: SyncFailure,
  suppressedCount: number,
  isDev: boolean
): { subject: string; text: string } {
  const what = failure.entityLabel
    ? `${failure.entityType} "${failure.entityLabel}"`
    : failure.entityType;

  const subject = `${isDev ? '[dev] ' : ''}${failure.destination} sync failed: ${what}`;

  const lines = [
    `A ${failure.entityType} didn't sync to ${failure.destination}, so the public copy may be out of date.`,
    '',
    `Record: ${what}`,
    `Record id: ${failure.entityId}`,
    `Function: ${failure.source}`,
    `Error: ${errorMessage(failure.error)}`,
  ];

  if (suppressedCount > 0) {
    lines.push(
      '',
      `This sync also failed ${suppressedCount} more time${suppressedCount === 1 ? '' : 's'} for this record since the last alert.`
    );
  }

  lines.push(
    '',
    `Saving the ${failure.entityType} again in the admin portal retries the sync. If it keeps failing, forward this email to David.`,
    '',
    `You won't get another email about this record for ${ALERT_WINDOW_MS / 3_600_000} hours.`
  );

  return { subject, text: lines.join('\n') };
}

/**
 * Queue an alert email for a failed sync, subject to the per-record throttle.
 *
 * Returns whether an email was queued. Never throws.
 */
export async function reportSyncFailure(
  failure: SyncFailure,
  now: Date = new Date()
): Promise<boolean> {
  try {
    const db = getDb();
    const throttleRef = db
      .collection(SYNC_ALERTS_COLLECTION)
      .doc(throttleDocId(failure.source, failure.entityId));
    const mailRef = db.collection('mail').doc();

    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(throttleRef);
      const data = snap.exists ? snap.data() : undefined;
      const lastAlertedAt: Date | undefined = data?.['lastAlertedAt']?.toDate
        ? data['lastAlertedAt'].toDate()
        : undefined;
      const suppressedCount = Number(data?.['suppressedCount'] ?? 0);

      if (
        lastAlertedAt &&
        now.getTime() - lastAlertedAt.getTime() < ALERT_WINDOW_MS
      ) {
        tx.set(
          throttleRef,
          { suppressedCount: suppressedCount + 1, lastFailedAt: now },
          { merge: true }
        );
        return false;
      }

      const message = buildSyncFailureEmail(
        failure,
        suppressedCount,
        FirebaseProject.isDev
      );
      tx.create(mailRef, { to: adminAlertEmail.value(), message });
      tx.set(throttleRef, {
        source: failure.source,
        entityId: failure.entityId,
        lastAlertedAt: now,
        lastFailedAt: now,
        suppressedCount: 0,
      });
      return true;
    });
  } catch (alertError) {
    console.error('[reportSyncFailure] could not queue alert:', alertError);
    return false;
  }
}
