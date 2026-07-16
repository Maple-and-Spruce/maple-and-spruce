import { EMULATOR_CONFIG } from './utils/emulator-config.js';

beforeAll(async () => {
  // Dev-target suites (E2E_TARGET=dev, e.g. pos-sandbox-e2e's Tier-2
  // pos-dev-smoke) talk to DEPLOYED dev over the network, not local emulators —
  // there are no emulators to reach, so skip the readiness probe. Every
  // emulator-backed suite leaves E2E_TARGET unset and still gets the check.
  if (process.env['E2E_TARGET'] === 'dev') {
    return;
  }

  const checks = [
    {
      name: 'Functions',
      url: EMULATOR_CONFIG.functionsHost,
    },
    {
      name: 'Firestore',
      url: `http://${EMULATOR_CONFIG.firestoreHost}`,
    },
    {
      name: 'Auth',
      url: `http://${EMULATOR_CONFIG.authHost}`,
    },
  ];

  for (const check of checks) {
    try {
      await fetch(check.url, { signal: AbortSignal.timeout(10000) });
    } catch {
      throw new Error(
        `${check.name} emulator is not running at ${check.url}. ` +
          'Start emulators with: firebase emulators:start --project=dev --only auth,firestore,functions'
      );
    }
  }
});
