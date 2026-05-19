/**
 * Registration test harness — minimal Vite app that mounts the
 * production `RegistrationWidget` against either local Firebase
 * emulators (Phase 1) or the deployed dev project (Phase 2).
 *
 * Used by `apps/registration-e2e/` Playwright tests to exercise the
 * full FE→BE wiring (widget → callable → Firestore) end-to-end, the
 * same way a customer hits it in production. Catches the class of bug
 * that unit tests miss: arg shape between the form and the cloud
 * function, and the contract between the cost-calc response and the
 * cost summary render.
 *
 * Selecting which class to load:
 *   ?classId=<id>       — required (seeded ahead of time)
 *
 * Selecting which backend to call:
 *   VITE_TARGET_ENV=emulator (default) — 127.0.0.1 functions emulator
 *   VITE_TARGET_ENV=dev               — deployed maple-and-spruce-dev
 *
 * Square credentials are intentionally fake. The current E2E suite
 * stops short of Square tokenization.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Import directly from the module path (not via Webflow component shim)
// to avoid pulling in @webflow/react. The boundary rule is skipped in
// CI (no cached Nx project graph there) but trips local lint, so it's
// disabled inline here.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { RegistrationWidget } from '../../webflow-components/src/RegistrationWidget';

const targetEnv = import.meta.env['VITE_TARGET_ENV'] ?? 'emulator';

// Tell firebase-init which emulator port to point at — only matters
// when targetEnv === 'emulator'. Setting it unconditionally is
// harmless because the dev/prod branches in firebase-init don't read
// it. Read from VITE_FUNCTIONS_EMULATOR_PORT (defined at build time
// in vite.config.ts so EMULATOR_PORT_OFFSET in worktrees flows
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
        <p>
          Backend target: <code>{targetEnv}</code>
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Small banner so a human visiting the deployed harness can tell
          which backend it's pointing at. Phase 2 ships this to a public
          Firebase Hosting URL; without the banner, it would be ambiguous
          whether you're hitting dev or an emulator. */}
      <div
        data-testid="harness-banner"
        style={{
          padding: '4px 8px',
          fontFamily: 'system-ui',
          fontSize: 12,
          background: targetEnv === 'dev' ? '#fff7c2' : '#e2e2e2',
          borderBottom: '1px solid #ccc',
        }}
      >
        Registration test harness — backend: <strong>{targetEnv}</strong>
      </div>
      <RegistrationWidget
        classId={classId}
        // Square Web Payments SDK requires non-empty IDs to initialise.
        // These are sandbox-formatted dummies — the form renders, but
        // tokenization is never exercised by the current E2E suite.
        squareAppId="sandbox-sq0idb-0000000000000000000000"
        squareLocationId="L00000000000"
        env={targetEnv}
        showDigitalWallets="hide"
      />
    </>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element in index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
