import { defineConfig, devices } from '@playwright/test';
import { workspaceRoot } from '@nx/devkit';

/**
 * Music Together enrollment E2E config — the higher-layer counterpart to the
 * MT cloud-function integration suite. Drives the production
 * `MusicTogetherRegistrationWidget` (mounted in the shared
 * registration-test-harness via `?mtSectionId=`) end-to-end: family form →
 * MT Square sandbox tokenize → `createMusicTogetherRegistration` (routing to
 * MT's SEPARATE Square account) → confirmed registration.
 *
 * Mirrors apps/registration-e2e; two targets picked by `E2E_TARGET`:
 *
 * - `emulator` (default) — PR check: harness on a local Vite server, callables
 *   on the local Firebase emulator with the PR's own code, real MT Square
 *   sandbox, HTTP mock servers for Webflow + Etsy. Boots the harness via the
 *   `webServer` block. Pair with `firebase emulators:exec`
 *   (see `tools/run-music-together-e2e.sh`).
 *
 * - `dev` — post-merge gate: harness on the deployed Firebase Hosting site
 *   `maple-spruce-registration-test` (same site serves both widgets), callables
 *   on deployed `maple-and-spruce-dev`, real MT Square sandbox, real Webflow +
 *   Etsy dev integrations. No `webServer`; baseURL points at the deployed
 *   harness URL. Seed runs against real Firestore via Admin SDK (ADC).
 */
const target = process.env['E2E_TARGET'] ?? 'emulator';
const offset = Number.parseInt(process.env['EMULATOR_PORT_OFFSET'] ?? '0', 10);
const harnessPort = 4173 + offset;

const DEFAULT_DEV_HARNESS_URL =
  'https://maple-spruce-registration-test.web.app';

const baseURL =
  process.env['HARNESS_BASE_URL'] ??
  (target === 'dev'
    ? DEFAULT_DEV_HARNESS_URL
    : // `localhost` (not `127.0.0.1`) — Square's Web Payments SDK allows
      // localhost as a secure-context exception but rejects raw IPs.
      `http://localhost:${harnessPort}`);

export default defineConfig({
  testDir: './src',
  testMatch: '**/*.spec.ts',
  retries: process.env['CI'] ? 1 : 0,
  // One worker keeps the seeded section deterministic — the family cap and
  // "spots remaining" assertions would race with parallel workers on a
  // shared backend.
  workers: 1,
  reporter: process.env['CI']
    ? [['html', { open: 'never' }], ['list']]
    : 'list',
  globalSetup: require.resolve('./src/global-setup.ts'),
  globalTeardown: require.resolve('./src/global-teardown.ts'),
  timeout: target === 'dev' ? 60_000 : 30_000,
  expect: { timeout: target === 'dev' ? 15_000 : 5_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  ...(target === 'emulator' && {
    webServer: {
      // Spawn Vite directly (not via `nx run …:serve`) so the @nx/playwright
      // plugin doesn't treat the harness as a build-time `dependsOn`.
      command: 'npx vite',
      url: baseURL,
      reuseExistingServer: !process.env['CI'],
      cwd: `${workspaceRoot}/apps/registration-test-harness`,
      timeout: 120_000,
      env: {
        EMULATOR_PORT_OFFSET: String(offset),
        // Forward MT's Square sandbox IDs into the Vite build so the widget
        // tokenizes against MT's account. Exported by the CI job (and the
        // local run script) from .env.dev.
        VITE_MT_SQUARE_APPLICATION_ID:
          process.env['VITE_MT_SQUARE_APPLICATION_ID'] ?? '',
        VITE_MT_SQUARE_LOCATION_ID:
          process.env['VITE_MT_SQUARE_LOCATION_ID'] ?? '',
      },
    },
  }),
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
