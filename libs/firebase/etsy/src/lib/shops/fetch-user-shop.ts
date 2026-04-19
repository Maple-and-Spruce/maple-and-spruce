/**
 * Resolve the shop ID for an Etsy user.
 *
 * Etsy's `GET /users/{user_id}/shops` endpoint historically returns
 * different shapes depending on account state and API version. We've
 * observed both:
 *
 *   1. A single Shop object at the top level: `{ shop_id, shop_name, ... }`
 *   2. A paginated wrapper: `{ count, results: [{ shop_id, ... }] }`
 *
 * This helper accepts both and returns the shop ID as a string, or
 * `null` if the API call fails or neither shape yields an id. Callers
 * treat the failure as non-fatal — the UI exposes a manual retry.
 */

/** Minimal subset of the Etsy v3 response shapes we care about. */
interface EtsyUserShopResponse {
  shop_id?: number;
  results?: Array<{ shop_id?: number }>;
}

export interface FetchUserShopOptions {
  /** Base Etsy API URL (overridable via process.env['ETSY_API_BASE']). */
  apiBase: string;
  apiKey: string;
  sharedSecret: string;
  userId: string;
  accessToken: string;
  /** Injectable for tests. Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

export interface FetchUserShopResult {
  shopId: string | null;
  /** HTTP status of the shop lookup, or `null` if the request errored out. */
  status: number | null;
  /** Debug detail for failures — not surfaced in normal happy-path. */
  reason?: string;
}

/**
 * Parse a shop ID out of whichever response shape Etsy returned.
 */
export function parseShopId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const resp = body as EtsyUserShopResponse;

  if (typeof resp.shop_id === 'number') {
    return String(resp.shop_id);
  }

  const first = resp.results?.[0];
  if (first && typeof first.shop_id === 'number') {
    return String(first.shop_id);
  }

  return null;
}

/**
 * Call `GET /users/{user_id}/shops` and extract the shop ID.
 * Never throws — failures are returned as `{ shopId: null, reason }`.
 */
export async function fetchUserShopId(
  options: FetchUserShopOptions
): Promise<FetchUserShopResult> {
  const f = options.fetchImpl ?? globalThis.fetch;
  let response: Response;
  try {
    response = await f(`${options.apiBase}/users/${options.userId}/shops`, {
      headers: {
        'x-api-key': `${options.apiKey}:${options.sharedSecret}`,
        Authorization: `Bearer ${options.accessToken}`,
      },
    });
  } catch (err) {
    return {
      shopId: null,
      status: null,
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  if (!response.ok) {
    let body = '';
    try {
      body = await response.text();
    } catch {
      // ignore — body already missing
    }
    return {
      shopId: null,
      status: response.status,
      reason: body || response.statusText,
    };
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (err) {
    return {
      shopId: null,
      status: response.status,
      reason:
        err instanceof Error ? err.message : 'Invalid JSON from Etsy',
    };
  }

  const shopId = parseShopId(parsed);
  if (shopId) {
    return { shopId, status: response.status };
  }

  return {
    shopId: null,
    status: response.status,
    reason: `Unrecognized response shape: ${JSON.stringify(parsed).slice(0, 200)}`,
  };
}
