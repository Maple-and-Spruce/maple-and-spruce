/**
 * Registration test harness — minimal Vite app that mounts the
 * production `RegistrationWidget` against either local Firebase
 * emulators (PR-check) or the deployed dev project (post-merge).
 *
 * Used by `apps/registration-e2e/` Playwright tests to exercise the
 * full FE→BE wiring (widget → callable → Firestore + Square sandbox)
 * end-to-end, the same way a customer hits it in production.
 *
 * Selecting which class to load:
 *   ?classId=<id>       — required (seeded ahead of time)
 *
 * Selecting which backend to call:
 *   VITE_TARGET_ENV=emulator (default) — 127.0.0.1 functions emulator
 *   VITE_TARGET_ENV=dev               — deployed maple-and-spruce-dev
 *
 * Square sandbox creds (both browser-public — not secrets):
 *   VITE_SQUARE_APPLICATION_ID — sandbox app ID from Square Developer
 *   VITE_SQUARE_LOCATION_ID    — sandbox location ID
 * Sourced from `.env.dev` at build time and forwarded through
 * vite.config.ts's `define` block (see build-check.yml +
 * firebase-functions-merge.yml).
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Import directly from the module path (not via Webflow component shim)
// to avoid pulling in @webflow/react. The boundary rule is skipped in
// CI (no cached Nx project graph there) but trips local lint, so it's
// disabled inline here.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { RegistrationWidget } from '../../webflow-components/src/RegistrationWidget';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { MusicTogetherRegistrationWidget } from '../../webflow-components/src/MusicTogetherRegistrationWidget';

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

// Real sandbox creds — the SDK loads from sandbox.web.squarecdn.com
// (see SquareCardForm.tsx; any env !== 'prod' selects sandbox), and
// the IDs below bind tokenization to our merchant.
const squareApplicationId = import.meta.env['VITE_SQUARE_APPLICATION_ID'];
const squareLocationId = import.meta.env['VITE_SQUARE_LOCATION_ID'];

// Music Together's SEPARATE Square account — bound to the MT widget so a card
// tokenized here can only be charged by MT's account (see routing assertion in
// the music-together-e2e spec).
const mtSquareApplicationId = import.meta.env['VITE_MT_SQUARE_APPLICATION_ID'];
const mtSquareLocationId = import.meta.env['VITE_MT_SQUARE_LOCATION_ID'];

function HarnessBanner({ label }: { label: string }) {
  // Small banner so a human visiting the deployed harness can tell which
  // backend + widget it's pointing at.
  return (
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
      {label} — backend: <strong>{targetEnv}</strong>
    </div>
  );
}

/**
 * Music Together enrollment harness view. Selected by `?mtSectionId=<id>`.
 * Mounts the production `MusicTogetherRegistrationWidget` with MT's own Square
 * sandbox credentials so the enrollment E2E drives the real family checkout.
 */
function MusicTogetherApp({ sectionId }: { sectionId: string }) {
  if (!mtSquareApplicationId || !mtSquareLocationId) {
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui' }}>
        <h2>Missing Music Together Square sandbox credentials</h2>
        <p>
          The harness build did not receive{' '}
          <code>VITE_MT_SQUARE_APPLICATION_ID</code> /{' '}
          <code>VITE_MT_SQUARE_LOCATION_ID</code>. Check the workflow that
          built this bundle.
        </p>
      </div>
    );
  }

  return (
    <>
      <HarnessBanner label="Music Together registration test harness" />
      <MusicTogetherRegistrationWidget
        sectionId={sectionId}
        squareAppId={mtSquareApplicationId}
        squareLocationId={mtSquareLocationId}
        env={targetEnv}
        policiesUrl="https://www.mapleandsprucefolkarts.com/music-together-policies"
      />
    </>
  );
}

function App() {
  const params = new URLSearchParams(window.location.search);
  const mtSectionId = params.get('mtSectionId') ?? '';
  const classId = params.get('classId') ?? '';

  // Music Together enrollment flow takes precedence when its param is present.
  if (mtSectionId) {
    return <MusicTogetherApp sectionId={mtSectionId} />;
  }

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

  if (!squareApplicationId || !squareLocationId) {
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui' }}>
        <h2>Missing Square sandbox credentials</h2>
        <p>
          The harness build did not receive{' '}
          <code>VITE_SQUARE_APPLICATION_ID</code> /{' '}
          <code>VITE_SQUARE_LOCATION_ID</code>. Check the workflow that
          built this bundle.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Small banner so a human visiting the deployed harness can tell
          which backend it's pointing at. Without the banner it would be
          ambiguous whether you're hitting dev or an emulator. */}
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
        squareAppId={squareApplicationId}
        squareLocationId={squareLocationId}
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
