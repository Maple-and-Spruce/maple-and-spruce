import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getMapleApp } from './maple-app';
import { mapleFirebaseConfig } from './maple-firebase-config';

let _mapleFunctions: ReturnType<typeof getFunctions> | undefined;

// Functions are deployed to us-east4 (Northern Virginia - close to WV business)
const FUNCTIONS_REGION = 'us-east4';

// Dot access (not bracket) so Next inlines the value into the browser bundle;
// `process.env['NEXT_PUBLIC_…']` is not statically replaced and reads undefined
// client-side (which silently pinned this to the 5001 default at any offset).
const EMULATOR_PORT = parseInt(
  process.env.NEXT_PUBLIC_FUNCTIONS_EMULATOR_PORT ?? '5001',
  10,
);

export const getMapleFunctions = () => {
  if (!_mapleFunctions) {
    _mapleFunctions = getFunctions(getMapleApp(), FUNCTIONS_REGION);

    // Connect to local functions emulator only on localhost
    // Note: business-dev.* hostname should hit deployed dev functions, not emulator
    if (
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1')
    ) {
      connectFunctionsEmulator(_mapleFunctions, 'localhost', EMULATOR_PORT);
    }
  }
  return _mapleFunctions;
};

/**
 * The absolute URL of one route on a domain router (ADR-029).
 *
 * A router is one Cloud Function serving many endpoints, so the endpoint lives in
 * the URL path rather than the function name — which means `httpsCallable(fn,
 * name)` cannot address it and `httpsCallableFromURL` needs a full URL built
 * here, where the emulator/deployed decision already lives.
 *
 * The emulator's shape differs from production's, and getting this wrong is a
 * 404 on every call, so both are spelled out:
 *   emulator  http://localhost:<port>/<projectId>/<region>/<router>/<route>
 *   deployed  https://<region>-<projectId>.cloudfunctions.net/<router>/<route>
 */
export const routerCallableUrl = (router: string, route: string): string => {
  const projectId = mapleFirebaseConfig.projectId;
  const onLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1');

  return onLocalhost
    ? `http://localhost:${EMULATOR_PORT}/${projectId}/${FUNCTIONS_REGION}/${router}/${route}`
    : `https://${FUNCTIONS_REGION}-${projectId}.cloudfunctions.net/${router}/${route}`;
};
