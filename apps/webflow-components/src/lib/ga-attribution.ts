/**
 * Google Analytics id capture for the public class registration widget.
 *
 * The GA4 `purchase` is sent server-side by `sendRegistrationConversion` (GA4
 * Measurement Protocol), so it can't be lost to an ad blocker or the
 * Square-hosted checkout redirect. A server event is only joined to the buyer's
 * GA4 session, and so only credited to the channel they came from, if it
 * carries the same `client_id` and `session_id` the browser tag is using. Both
 * live in cookies the GA4 tag (loaded by GTM) writes:
 *
 *   `_ga`             GA1.1.<random>.<firstSeenSecs>   → client id `<random>.<firstSeenSecs>`
 *   `_ga_<stream>`    GS1.1.<sessionId>.<n>.…           (older format)
 *                     GS2.1.s<sessionId>$o<n>$g…$t…     (current format)
 *
 * @see https://developers.google.com/analytics/devguides/collection/protocol/ga4/sending-events
 */
import { readCookie } from './meta-attribution';

/** Attribution fields the widget appends to a registration payload. */
export interface GaAttribution {
  clientId?: string;
  sessionId?: string;
}

/**
 * Cookie suffix for the site's GA4 web stream: measurement id `G-TY0E9X31V6`
 * without the `G-`. The session cookie is per-stream, so it is read by exact
 * name rather than by guessing among any `_ga_*` cookies on the domain.
 */
export const GA4_STREAM_COOKIE_SUFFIX = 'TY0E9X31V6';

/** `GA1.1.123.456` → `123.456`; undefined when the shape is unexpected. */
export function parseGaClientId(cookie: string | undefined): string | undefined {
  if (!cookie) return undefined;
  const parts = cookie.split('.');
  if (parts.length < 4) return undefined;
  const clientId = parts.slice(-2).join('.');
  return /^\d+\.\d+$/.test(clientId) ? clientId : undefined;
}

/** Session id from either `_ga_<stream>` cookie format; undefined otherwise. */
export function parseGaSessionId(
  cookie: string | undefined
): string | undefined {
  if (!cookie) return undefined;
  // Current format: GS2.1.s1700000000$o5$g1$t1700000300$j0$l0$h0
  const gs2 = /^GS2\.\d+\.s(\d+)/.exec(cookie);
  if (gs2) return gs2[1];
  // Older format: GS1.1.1700000000.5.1.1700000300.0.0.0
  const gs1 = /^GS1\.\d+\.(\d+)\./.exec(cookie);
  if (gs1) return gs1[1];
  return undefined;
}

interface AttributionWindow {
  document?: { cookie?: string };
}

/**
 * Snapshot the GA4 client + session ids at checkout time.
 *
 * Never throws — a privacy extension or sandboxed frame can make
 * `document.cookie` inaccessible, and that must not break a checkout. Without
 * consent, or before GTM has loaded, the cookies are simply absent and the
 * server sends the purchase without them.
 */
export function readGaAttribution(win: unknown): GaAttribution {
  const result: GaAttribution = {};
  try {
    const cookies = (win as AttributionWindow | null)?.document?.cookie;
    const clientId = parseGaClientId(readCookie(cookies, '_ga'));
    if (clientId) result.clientId = clientId;
    const sessionId = parseGaSessionId(
      readCookie(cookies, `_ga_${GA4_STREAM_COOKIE_SUFFIX}`)
    );
    if (sessionId) result.sessionId = sessionId;
  } catch {
    // Best effort — return whatever we managed to collect.
  }
  return result;
}
