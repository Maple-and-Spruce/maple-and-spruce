/**
 * Square credential routing — pure, dependency-free.
 *
 * This file intentionally imports NOTHING heavy (no `@maple/firebase/functions`
 * barrel, no Square SDK, no service classes). Keeping it barrel-free lets unit
 * tests exercise the account-routing logic without cascading the functions +
 * database layers into the coverage denominator. See the barrel-cascade gotcha:
 * a single spec that loads `square.utility.ts` (which imports the functions
 * barrel) pulls ~40 untested repository/utility files into the report and tanks
 * global coverage. The `Square` class composes this helper.
 */

/**
 * Secret names for Firebase Functions secrets (use with defineSecret()).
 * Each Firebase project has its own SQUARE_ACCESS_TOKEN value:
 * - maple-and-spruce-dev: sandbox token
 * - maple-and-spruce: production token
 */
export const SQUARE_SECRET_NAMES = ['SQUARE_ACCESS_TOKEN'] as const;

/**
 * String parameter names for Firebase Functions (use with defineString()).
 * SQUARE_ENV: 'LOCAL' (sandbox) or 'PROD' (production)
 * SQUARE_LOCATION_ID: location ID for orders/payments/inventory
 * SALES_TAX_RATE: sales-tax rate percent (e.g. '6.0')
 */
export const SQUARE_STRING_NAMES = [
  'SQUARE_ENV',
  'SQUARE_LOCATION_ID',
  'SALES_TAX_RATE',
] as const;

export type SquareSecrets = Record<
  (typeof SQUARE_SECRET_NAMES)[number],
  string
>;

export type SquareStrings = Record<
  (typeof SQUARE_STRING_NAMES)[number],
  string
>;

/**
 * Music Together (MT) is a SEPARATE business (Stephanie's single-member LLC)
 * with its OWN Square account/checking. Its checkouts must route to MT's
 * Square credentials, not Maple & Spruce's. A Cloud Function declares these
 * prefixed param names via `.usingSecrets(...)` / `.usingStrings(...)` when it
 * needs the MT account.
 *
 * The secret value (MT_SQUARE_ACCESS_TOKEN) lives in Secret Manager /
 * .secret.local, never in the tracked .env files. The string params live in
 * .env.dev/.env.prod (mirroring the default SQUARE_* set).
 */
export const MT_SQUARE_SECRET_NAMES = ['MT_SQUARE_ACCESS_TOKEN'] as const;

export const MT_SQUARE_STRING_NAMES = [
  'MT_SQUARE_ENV',
  'MT_SQUARE_LOCATION_ID',
  'MT_SALES_TAX_RATE',
] as const;

/**
 * The four Firebase param names a {@link Square} instance reads, so the same
 * client wrapper can be pointed at either the Maple & Spruce account (default)
 * or a second program's account (e.g. Music Together) without touching any
 * call site beyond which key set it passes.
 */
export interface SquareParamKeys {
  /** defineSecret name holding the access token */
  accessTokenSecret: string;
  /** defineString name holding 'LOCAL' | 'PROD' */
  envString: string;
  /** defineString name holding the Square location ID */
  locationIdString: string;
  /** defineString name holding the sales-tax rate percent (e.g. '6.0') */
  taxRateString: string;
}

/** Default Maple & Spruce account keys — preserves all existing behavior. */
export const DEFAULT_SQUARE_KEYS: SquareParamKeys = {
  accessTokenSecret: 'SQUARE_ACCESS_TOKEN',
  envString: 'SQUARE_ENV',
  locationIdString: 'SQUARE_LOCATION_ID',
  taxRateString: 'SALES_TAX_RATE',
};

/** Music Together account keys (separate Square account). */
export const MT_SQUARE_KEYS: SquareParamKeys = {
  accessTokenSecret: 'MT_SQUARE_ACCESS_TOKEN',
  envString: 'MT_SQUARE_ENV',
  locationIdString: 'MT_SQUARE_LOCATION_ID',
  taxRateString: 'MT_SALES_TAX_RATE',
};

/** Resolved, validated credentials for one Square account. */
export interface ResolvedSquareCredentials {
  accessToken: string;
  locationId: string;
  taxRatePercent: number;
  isProd: boolean;
}

/**
 * Read and validate one account's credentials from the resolved Firebase
 * secrets/strings, using the given key set (defaults to Maple & Spruce).
 *
 * Mirrors `ServiceEnvironment`'s env normalization + secret lookup inline so
 * this file stays free of the functions barrel (see file header). Throws with
 * the account-specific param name when a value is missing/invalid.
 */
export function resolveSquareCredentials(
  secrets: Record<string, string>,
  strings: Record<string, string>,
  keys: SquareParamKeys = DEFAULT_SQUARE_KEYS
): ResolvedSquareCredentials {
  const isProd = (strings[keys.envString] ?? 'LOCAL').toUpperCase() === 'PROD';

  const accessToken = secrets[keys.accessTokenSecret];
  if (!accessToken) {
    throw new Error(
      `Secret ${keys.accessTokenSecret} not configured. ` +
        `Set it using: firebase functions:secrets:set ${keys.accessTokenSecret}`
    );
  }

  const locationId = strings[keys.locationIdString];
  if (!locationId) {
    throw new Error(
      `Square location ID not configured. Set ${keys.locationIdString}.`
    );
  }

  const taxRatePercent = parseFloat(strings[keys.taxRateString]);
  if (isNaN(taxRatePercent) || taxRatePercent < 0) {
    throw new Error(
      `Sales tax rate not configured or invalid. Set ${keys.taxRateString} (e.g., "6.0").`
    );
  }

  return { accessToken, locationId, taxRatePercent, isProd };
}
