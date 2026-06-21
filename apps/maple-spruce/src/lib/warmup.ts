import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';

/**
 * Cloud Functions on the portal's first-paint critical path. Each is a
 * separate gen2 service with its own cold start; warming them in parallel
 * with the Firebase auth handshake hides that cold start from the user.
 *
 * Keep this in sync with the functions the shell + dashboard call on mount:
 * - AdminGuard           -> checkAdminStatus
 * - AppShell             -> getSyncConflictSummary
 * - DashboardPage        -> getClasses / getRegistrations / getProducts
 * - room schedule widget -> getRoomSchedule
 */
export const DASHBOARD_WARMUP_FUNCTIONS = [
  'checkAdminStatus',
  'getSyncConflictSummary',
  'getClasses',
  'getRegistrations',
  'getProducts',
  'getRoomSchedule',
] as const;

/**
 * Pre-warm the portal's hot-path Cloud Functions. Fire-and-forget: the
 * warmup sentinel short-circuits server-side before auth, validation, and
 * the handler (see `functions.utility.ts`), so this can safely run before
 * the user is authenticated. Errors are swallowed — warmup is a best-effort
 * optimization, never a correctness dependency.
 */
export function warmupDashboard(): void {
  const functions = getMapleFunctions();
  for (const name of DASHBOARD_WARMUP_FUNCTIONS) {
    httpsCallable(functions, name)({ __warmup: true }).catch(() => undefined);
  }
}
