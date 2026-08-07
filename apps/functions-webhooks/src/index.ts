/**
 * Firebase Cloud Functions — Third-Party Webhooks Codebase
 *
 * Endpoints called by external SaaS platforms that enforce a short delivery
 * timeout and give us no say in it. Tally hangs up at 10s; Square at 10s.
 * A cold start that blows that budget is a *dropped event*, not a slow one.
 *
 * Why these can't live in maple-core
 * ----------------------------------
 * A Firebase codebase is one bundle: every function in it loads the whole
 * entry point on cold start, so boot time is set by the heaviest sibling,
 * not by the function being called. Measured against prod (2026-08-07,
 * invalid-signature probes, so handler logic never ran):
 *
 *   maple-core      14.4s cold / 1.0s warm   <- tallyLeadWebhook lived here
 *   maple-sync       6.3s cold / 1.3s warm
 *   maple-calendar   3.2s cold / 1.1s warm
 *
 * The Tally form draws roughly one signup a day, so this service is cold on
 * essentially every real delivery — 14.4s against a 10s budget meant Tally
 * recorded a `timeout of 10000ms exceeded` failure for nearly every lead,
 * and Tally does not retry. Five leads were lost between 2026-07-30 and
 * 2026-08-06 before anyone noticed.
 *
 * KEEP THIS BUNDLE SMALL — that is the entire point
 * -------------------------------------------------
 * Adding a function that pulls firebase-admin repositories, the Square SDK,
 * or webflow-api re-inflates cold start for everything in here and silently
 * reintroduces the outage. Before adding a function, ask whether its imports
 * are as light as what's already here (firebase-functions, crypto, vest).
 * If they aren't, it belongs in its own codebase.
 */
// MUST be first: sets global maxInstances before any function is defined.
// See global-runtime-options.ts for the ordering contract.
import '@maple/firebase/functions/global-runtime-options';

// Deliberately no initializeApp() — nothing in this codebase touches
// Firestore or Auth, and skipping admin init keeps the boot path short.

// ============================================================================
// Tally
// ============================================================================
export { tallyLeadWebhook } from '@maple/firebase/maple-functions/tally-lead-webhook';
