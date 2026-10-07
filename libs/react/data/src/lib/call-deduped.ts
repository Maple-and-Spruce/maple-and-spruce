import {
  httpsCallable,
  httpsCallableFromURL,
  type HttpsCallableResult,
} from 'firebase/functions';
import {
  getMapleFunctions,
  routerCallableUrl,
} from '@maple/ts/firebase/firebase-config';

/** A route on a domain router (ADR-029), e.g. `{ router: 'products', route: 'getProducts' }`. */
export interface RouterRoute {
  router: string;
  route: string;
}

/** What a read calls: a standalone function by name, or a route on a router. */
export type CallableTarget = string | RouterRoute;

/** `getClasses`, or `products/getProducts` for a route — the default dedupe key's prefix. */
function targetLabel(target: CallableTarget): string {
  return typeof target === 'string' ? target : `${target.router}/${target.route}`;
}

/**
 * In-flight requests keyed by dedupe key. An entry exists only while its
 * request is pending — it's removed as soon as the call settles.
 */
const inFlight = new Map<string, Promise<HttpsCallableResult<unknown>>>();

/**
 * Invoke a callable Cloud Function, sharing a single in-flight request across
 * concurrent identical callers.
 *
 * The portal mounts the same read hooks from multiple components (e.g. the
 * sync-conflict summary lives in both the app shell and the dashboard) and
 * remounts them during the auth -> admin transition, which previously fired
 * each query 2-3x on first load. Collapsing concurrent identical calls onto
 * one promise removes that burst without any cross-render caching: the entry
 * clears the moment the request settles, so this never serves stale data — it
 * only merges calls that overlap in time.
 *
 * Use this for idempotent reads only. Mutations call `httpsCallable` directly.
 *
 * @param target     callable function name (e.g. 'getClasses'), or a router
 *                   route (e.g. `{ router: 'products', route: 'getProducts' }`)
 * @param data       request payload
 * @param dedupeKey  override the key when the payload carries volatile fields
 *                   that shouldn't affect identity (e.g. a request timestamp).
 *                   Defaults to the target + serialized payload.
 */
export function callDeduped<Req, Res>(
  target: CallableTarget,
  data: Req,
  dedupeKey = `${targetLabel(target)}:${JSON.stringify(data ?? {})}`
): Promise<HttpsCallableResult<Res>> {
  const existing = inFlight.get(dedupeKey);
  if (existing) {
    return existing as Promise<HttpsCallableResult<Res>>;
  }

  const functions = getMapleFunctions();
  const callable =
    typeof target === 'string'
      ? httpsCallable<Req, Res>(functions, target)
      : httpsCallableFromURL<Req, Res>(
          functions,
          routerCallableUrl(target.router, target.route)
        );
  const promise = callable(data).finally(() => {
    inFlight.delete(dedupeKey);
  });

  inFlight.set(dedupeKey, promise as Promise<HttpsCallableResult<unknown>>);
  return promise;
}
