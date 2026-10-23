import { listFirestoreDocs } from './firestore-helper.js';

export type MailDoc = Awaited<ReturnType<typeof listFirestoreDocs>>[number];

/**
 * Subject of a `reportSyncFailure` alert: `[dev] Webflow sync failed: …` or
 * `Square sync failed: …` (see `buildSyncFailureEmail` in
 * `@maple/firebase/sync-alerts`). Mirrored here rather than imported, so the
 * test utils don't pull firebase-admin.
 */
const SYNC_FAILURE_SUBJECT = /^(\[dev\] )?(Webflow|Square) sync failed: /;

/** Whether a `mail` doc is a sync-failure alert to the studio. */
export function isSyncFailureAlert(doc: MailDoc): boolean {
  const message = doc.data['message'] as { subject?: unknown } | undefined;
  return (
    typeof message?.subject === 'string' &&
    SYNC_FAILURE_SUBJECT.test(message.subject)
  );
}

/**
 * The docs in the `mail` collection, leaving out sync-failure alerts unless
 * asked for.
 *
 * `mail` is shared by every function. Writing a class, category or section
 * fires the Webflow/Square sync triggers, and one still running when the next
 * `beforeEach` wipes Firestore fails to write back to its deleted record. Each
 * such failure queues a "sync failed" alert (`reportSyncFailure`) into the
 * freshly cleared `mail` collection, so a spec counting raw `mail` docs sees an
 * extra one depending on timing. The emulator has no way to wait for in-flight
 * triggers to finish, so specs filter instead: use this, not
 * `listFirestoreDocs('mail')`.
 *
 * Pass `{ includeSyncAlerts: true }` only in a spec that asserts on the alerts
 * themselves, and filter those by the record it expects.
 */
export async function listMail(
  options: { includeSyncAlerts?: boolean } = {}
): Promise<MailDoc[]> {
  const docs = await listFirestoreDocs('mail');
  return options.includeSyncAlerts
    ? docs
    : docs.filter((doc) => !isSyncFailureAlert(doc));
}
