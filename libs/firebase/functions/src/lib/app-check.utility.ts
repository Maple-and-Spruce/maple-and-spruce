/**
 * App Check verification for `Functions.endpoint` (ADR-034).
 *
 * Our endpoints are gen-2 `onRequest`, not `onCall`, so `enforceAppCheck` is
 * not available — the pipeline reads the `X-Firebase-AppCheck` header that
 * `httpsCallable` attaches once the client has initialized App Check, and
 * verifies it here.
 *
 * Opt-in per endpoint with `.withAppCheck(mode)`. The effective mode is the
 * *lower* of the endpoint's mode and the `APP_CHECK_MODE` env ceiling, so the
 * env var can turn enforcement down everywhere without touching endpoints:
 *
 * | mode      | token checked | request without a valid token |
 * |-----------|---------------|-------------------------------|
 * | `off`     | no            | runs                          |
 * | `monitor` | yes, logged   | runs                          |
 * | `enforce` | yes, logged   | 401 UNAUTHENTICATED           |
 */
import { getAppCheck } from 'firebase-admin/app-check';

export type AppCheckMode = 'off' | 'monitor' | 'enforce';

export type AppCheckResult = 'valid' | 'missing' | 'invalid';

export const APP_CHECK_HEADER = 'x-firebase-appcheck';

const MODE_RANK: Record<AppCheckMode, number> = {
  off: 0,
  monitor: 1,
  enforce: 2,
};

function parseMode(value: string | undefined): AppCheckMode {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'monitor' || normalized === 'enforce'
    ? normalized
    : 'off';
}

/**
 * The mode a request actually runs under: the endpoint's declared mode,
 * capped by the `APP_CHECK_MODE` env value. An unset or unrecognised env value
 * is `off`, so a codebase missing the variable never starts rejecting.
 */
export function resolveAppCheckMode(
  endpointMode: AppCheckMode | undefined,
  envValue: string | undefined
): AppCheckMode {
  const declared = endpointMode ?? 'off';
  const ceiling = parseMode(envValue);
  return MODE_RANK[declared] <= MODE_RANK[ceiling] ? declared : ceiling;
}

/**
 * Verify the request's App Check token, if it sent one.
 *
 * Never throws: a verification failure is an `invalid` result, and the caller
 * decides what the mode makes of it.
 */
export async function verifyAppCheckToken(
  headers: Record<string, string | string[] | undefined>,
  ensureAdminInitialized: () => void
): Promise<{ result: AppCheckResult; appId?: string }> {
  const raw = headers[APP_CHECK_HEADER];
  const token = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (!token) return { result: 'missing' };

  try {
    ensureAdminInitialized();
    const verified = await getAppCheck().verifyToken(token);
    return { result: 'valid', appId: verified.appId };
  } catch {
    return { result: 'invalid' };
  }
}
