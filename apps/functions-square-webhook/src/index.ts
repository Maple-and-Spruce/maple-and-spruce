/**
 * Firebase Cloud Functions — Square Webhook Codebase
 *
 * Square gives a webhook receiver 10 seconds to answer 2xx. Anything slower is
 * recorded as `http_timeout` (surfaced as 504 in the Square dashboard) and
 * starts an exponential-backoff retry chain lasting up to 24 hours.
 *
 * Why this isn't in maple-core (ADR-031)
 * --------------------------------------
 * A Firebase codebase is one bundle: every function loads the whole entry
 * point on cold start, so boot time is set by the heaviest sibling. In
 * maple-core (488kb) that measured **14.4s cold** against a 10s budget — the
 * webhook could not answer in time from a cold instance, and only survived
 * because Square retries until an instance is warm. That is what the 2026-05
 * 504 storm looked like. Isolated here the bundle is ~141kb.
 *
 * Why not share `maple-webhooks` with tallyLeadWebhook
 * ----------------------------------------------------
 * This function pulls `@maple/firebase/database` (firebase-admin +
 * repositories). Merging the two would push that cost onto tallyLeadWebhook,
 * which has NO retry safety net — Tally drops a failed delivery permanently.
 * Separate codebases keep each bundle honest.
 *
 * KEEP THIS BUNDLE SMALL. Handlers here should stay thin: validate, write to
 * Firestore, ack. Long-running work belongs in a Firestore-triggered worker
 * (the `CatalogSyncRequestRepository.requestRefresh()` →
 * `processCatalogSyncRequest` and `PosSaleRequestRepository.enqueue()`
 * patterns), not inline on the ack path.
 */
// MUST be first: sets global maxInstances before any function is defined.
// See global-runtime-options.ts for the ordering contract.
import '@maple/firebase/functions/global-runtime-options';
import { getApps, initializeApp } from 'firebase-admin/app';

if (getApps().length === 0) {
  initializeApp();
}

// ============================================================================
// Square
// ============================================================================
export { squareWebhook } from '@maple/firebase/maple-functions/square-webhook';
