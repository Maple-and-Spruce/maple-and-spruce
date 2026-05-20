import { defineConfig, devices } from '@playwright/test';
import { workspaceRoot } from '@nx/devkit';

/**
 * Registration E2E config — runs the same specs against either:
 *
 * - `E2E_TARGET=emulator` (default) — PR check: harness on local Vite
 *   server, callables on local Firebase emulator with the PR's own
 *   code, real Square sandbox, and HTTP mock servers for Webflow +
 *   Etsy. Boots the harness itself via the `webServer` block. Pair
 *   with `firebase emulators:exec` (see `tools/run-registration-e2e.sh`).
 *
 * - `E2E_TARGET=dev` — post-merge gate: harness on the deployed
 *   Firebase Hosting site `maple-spruce-registration-test`, callables
 *   on the deployed `maple-and-spruce-dev` project, real Square
 *   sandbox, real Webflow + Etsy dev integrations. No `webServer`;
 *   baseURL points at the deployed harness URL. Seed runs against
 *   real Firestore via Admin SDK (Application Default Credentials).
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
    : `http://127.0.0.1:${harnessPort}`);

export default defineConfig({
  testDir: './src',
  testMatch: '**/*.spec.ts',
  // One retry covers transient cold-start races (CI emulator just up,
  // or deployed-dev callable hitting an unwarm container).
  retries: process.env['CI'] ? 1 : 0,
  // One worker keeps seeded state deterministic; multiple workers
  // would race on the shared backend (emulator OR dev Firestore).
  workers: 1,
  reporter: process.env['CI']
    ? [['html', { open: 'never' }], ['list']]
    : 'list',
  globalSetup: require.resolve('./src/global-setup.ts'),
  globalTeardown: require.resolve('./src/global-teardown.ts'),
  // Deployed-dev callables can cold-start past the 30s default,
  // especially on the very first request after a deploy.
  timeout: target === 'dev' ? 60_000 : 30_000,
  expect: { timeout: target === 'dev' ? 15_000 : 5_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  // Local Vite server is only needed in emulator mode. In dev mode the
  // harness is already deployed to Firebase Hosting — Playwright hits
  // the public URL directly.
  ...(target === 'emulator' && {
    webServer: {
      // Spawn Vite directly (not via `nx run …:serve`) so the @nx/playwright
      // plugin doesn't pick this up as a build-time `dependsOn` and try to
      // start the harness as a blocking prereq before Playwright runs.
      command: 'npx vite',
      url: baseURL,
      reuseExistingServer: !process.env['CI'],
      cwd: `${workspaceRoot}/apps/registration-test-harness`,
      timeout: 120_000,
      env: {
        EMULATOR_PORT_OFFSET: String(offset),
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
