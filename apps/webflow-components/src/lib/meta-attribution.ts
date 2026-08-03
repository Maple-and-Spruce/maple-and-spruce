/**
 * Meta ad-attribution capture for the public registration widgets.
 *
 * The browser is the only place `_fbp` / `_fbc` exist. Threading them into the
 * `createRegistration` / `createMusicTogetherRegistration` payloads lets the
 * server-side Conversions API `Purchase` event link the conversion back to the
 * exact ad click, instead of relying on email-hash matching alone (which is
 * what lifts Events Manager "match quality" past 7/10).
 *
 * Dedup with the browser Pixel is handled elsewhere and already works for
 * classes: `sendRegistrationConversion` uses the registration's
 * `confirmationNumber` as the CAPI `event_id`, and `buildPurchasePixelEvent`
 * passes the same value as the Pixel's `eventID` (see `class-analytics.ts`).
 * Music Together fires no browser Pixel event, so its server event uses
 * `mt-<registrationId>` and has nothing to collapse against.
 *
 * @see https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events
 */

/** Attribution fields the widgets append to a registration payload. */
export interface MetaAttribution {
  /** `_fbp` browser cookie (Meta's first-party browser id) */
  fbp?: string;
  /** `_fbc` browser cookie, or one synthesized from a `fbclid` query param */
  fbc?: string;
  /** The page the buyer converted on */
  eventSourceUrl?: string;
}

/** Read a cookie value by name, or undefined when absent/empty. */
export function readCookie(
  cookieString: string | undefined,
  name: string
): string | undefined {
  if (!cookieString) return undefined;
  for (const part of cookieString.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const value = decodeURIComponent(part.slice(eq + 1).trim());
    if (value) return value;
  }
  return undefined;
}

/**
 * Build an `_fbc` value from a raw `fbclid`.
 *
 * Meta's format is `fb.<subdomainIndex>.<creationTimeMs>.<fbclid>`. We use
 * subdomain index 1 (the value the Pixel writes for a domain like
 * `mapleandsprucefolkarts.com`). This is the fallback for when the Pixel
 * script hasn't written the `_fbc` cookie yet — e.g. the buyer landed from an
 * ad and registered before fbevents.js finished loading.
 */
export function fbcFromFbclid(
  fbclid: string,
  nowMs: number = Date.now()
): string {
  return `fb.1.${nowMs}.${fbclid}`;
}

/** Pull `fbclid` out of a `?a=b&fbclid=...` style search string. */
export function readFbclid(search: string | undefined): string | undefined {
  if (!search) return undefined;
  const query = search.startsWith('?') ? search.slice(1) : search;
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    if (pair.slice(0, eq) !== 'fbclid') continue;
    const value = decodeURIComponent(pair.slice(eq + 1));
    if (value) return value;
  }
  return undefined;
}

interface AttributionWindow {
  document?: { cookie?: string };
  location?: { search?: string; href?: string };
}

/**
 * Snapshot everything Meta needs from the browser at checkout time.
 *
 * Never throws — a sandboxed iframe or a privacy extension can make
 * `document.cookie` inaccessible, and that must not break a checkout.
 */
export function readMetaAttribution(win: unknown): MetaAttribution {
  const result: MetaAttribution = {};
  try {
    const w = (win ?? {}) as AttributionWindow;
    const cookies = w.document?.cookie;

    result.fbp = readCookie(cookies, '_fbp');

    const fbcCookie = readCookie(cookies, '_fbc');
    if (fbcCookie) {
      result.fbc = fbcCookie;
    } else {
      const fbclid = readFbclid(w.location?.search);
      if (fbclid) result.fbc = fbcFromFbclid(fbclid);
    }

    // Strip the query string: it carries fbclid/UTMs that would fragment the
    // URL in Events Manager reporting for no benefit.
    const href = w.location?.href;
    if (href) result.eventSourceUrl = href.split('?')[0].split('#')[0];
  } catch {
    // Best effort — return whatever we managed to collect.
  }
  return result;
}
