/**
 * Registration test harness — minimal Vite app that mounts the
 * production `RegistrationWidget` against local Firebase emulators.
 *
 * Used by `apps/registration-e2e/` Playwright tests to exercise the
 * full FE→BE wiring (widget → callable → emulator → seeded Firestore)
 * end-to-end, the same way a customer hits it in production. Catches
 * the class of bug that unit tests miss: arg shape between the form
 * and the cloud function, and the contract between the cost-calc
 * response and the cost summary render.
 *
 * Selecting which class to load:
 *   ?classId=<id>       — required (seeded by Playwright `globalSetup`)
 *
 * Square credentials are intentionally fake. Phase 1 tests cover the
 * flow up to "ready to pay"; Square Sandbox tokenization is a Phase 2
 * concern handled by tests that run against the real dev environment.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Import directly from the module path (not via Webflow component shim)
// to avoid pulling in @webflow/react.
import { RegistrationWidget } from '../../webflow-components/src/RegistrationWidget';

// Tell firebase-init which emulator port to point at. Set BEFORE the
// widget mounts so the very first `connectFunctionsEmulator` call
// uses it. Read from VITE_FUNCTIONS_EMULATOR_PORT (defined at build
// time in vite.config.ts so EMULATOR_PORT_OFFSET in worktrees flows
// through). 5001 is the Firebase default when no offset.
const port = Number.parseInt(
  import.meta.env['VITE_FUNCTIONS_EMULATOR_PORT'] ?? '5001',
  10
);
(
  globalThis as { __MAPLE_FUNCTIONS_EMULATOR_PORT__?: number }
).__MAPLE_FUNCTIONS_EMULATOR_PORT__ = port;

function App() {
  const params = new URLSearchParams(window.location.search);
  const classId = params.get('classId') ?? '';

  if (!classId) {
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui' }}>
        <h2>Missing ?classId query param</h2>
        <p>
          The harness expects the test runner to pass a seeded class ID
          via the URL: <code>?classId=&lt;id&gt;</code>.
        </p>
      </div>
    );
  }

  return (
    <RegistrationWidget
      classId={classId}
      // Square Web Payments SDK requires non-empty IDs to initialise.
      // These are sandbox-formatted dummies — the form renders, but
      // tokenization is never exercised by Phase 1 E2E tests.
      squareAppId="sandbox-sq0idb-0000000000000000000000"
      squareLocationId="L00000000000"
      env="emulator"
      showDigitalWallets="hide"
    />
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element in index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
