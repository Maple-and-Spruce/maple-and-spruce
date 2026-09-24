/**
 * Resolving a router's route from the request path (ADR-029).
 *
 * This lives in its own module, importing nothing, on purpose. It is the one
 * part of the router worth unit-testing directly, and a spec that reaches it
 * through `functions.utility` instead loads that module's real graph —
 * `auth.utility`, firebase-admin, and the whole `@maple/firebase/database`
 * repository layer: 101 files at ~6%, which drops merged coverage about seven
 * points. See "A spec can drop coverage ~7 points" in `docs/reference/code-standards.md`.
 */

/**
 * The route a request is asking for, or `undefined` if it names no route.
 *
 * The route is the **last** path segment, so every shape the same function is
 * reachable under resolves identically:
 *
 * - `/artists/getArtists` — cloudfunctions.net
 * - `/<project>/<region>/artists/getArtists` — the emulator
 * - `/api/artists/getArtists` — behind a Hosting rewrite
 *
 * A request to the router itself (`/artists`) names no route, and is a 404
 * rather than a silent dispatch to some default.
 */
export function routeNameFromPath(
  path: string,
  routerName: string
): string | undefined {
  const segments = path.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  if (!last || last === routerName) return undefined;
  return last;
}
