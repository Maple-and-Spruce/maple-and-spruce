import { httpsCallable, httpsCallableFromURL } from 'firebase/functions';
import {
  getMapleFunctions,
  routerCallableUrl,
} from '@maple/ts/firebase/firebase-config';
import type { CallableTarget } from '@maple/react/data';

/**
 * Cloud Functions on the portal's first-paint critical path. Each is a
 * separate gen2 service with its own cold start; warming them in parallel
 * with the Firebase auth handshake hides that cold start from the user.
 *
 * A router route (ADR-029) is warmed through any one of its routes — the
 * sentinel boots the router's instance, which serves every route on it.
 *
 * Keep this in sync with the functions the shell + dashboard call on mount:
 * - RolesProvider        -> getMyRoles
 * - AppShell             -> getSyncConflictSummary
 * - DashboardPage        -> getClasses / getRegistrations / products/getProducts
 * - room schedule widget -> getRoomSchedule
 */
export const DASHBOARD_WARMUP_FUNCTIONS: readonly CallableTarget[] = [
  'getMyRoles',
  'getSyncConflictSummary',
  'getClasses',
  'getRegistrations',
  { router: 'products', route: 'getProducts' },
  'getRoomSchedule',
];

/**
 * Pre-warm the portal's hot-path Cloud Functions. Fire-and-forget: the
 * warmup sentinel short-circuits server-side before auth, validation, and
 * the handler (see `functions.utility.ts`), so this can safely run before
 * the user is authenticated. Errors are swallowed — warmup is a best-effort
 * optimization, never a correctness dependency.
 */
export function warmupDashboard(): void {
  const functions = getMapleFunctions();
  for (const target of DASHBOARD_WARMUP_FUNCTIONS) {
    const callable =
      typeof target === 'string'
        ? httpsCallable(functions, target)
        : httpsCallableFromURL(
            functions,
            routerCallableUrl(target.router, target.route)
          );
    callable({ __warmup: true }).catch(() => undefined);
  }
}
