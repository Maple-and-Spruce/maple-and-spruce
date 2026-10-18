/**
 * Browser-captured Google Analytics ids, threaded through the checkout callables.
 *
 * The GA4 `purchase` for a class registration is sent server-side
 * (`sendRegistrationConversion`, via the Measurement Protocol) so it survives
 * ad blockers, Safari ITP and the Square-hosted checkout redirect. A server
 * event only joins the buyer's GA4 session, and so only gets credited to the
 * channel they arrived from, when it carries the same `client_id` and
 * `session_id` the browser tag is using. Those live in the `_ga` and
 * `_ga_<stream>` cookies, which only the browser can read.
 *
 * Every field is optional and purely advisory: a missing value means the
 * purchase lands in GA4 unattributed, nothing else. NEVER authorize or price
 * anything off these values — they are client-supplied and trivially forged.
 */
export interface GaAttributionPayload {
  /** GA client id from the `_ga` cookie, e.g. `1234567890.1700000000`. */
  clientId?: string;
  /** Current GA4 session id from the `_ga_<stream>` cookie, e.g. `1700000000`. */
  sessionId?: string;
}
