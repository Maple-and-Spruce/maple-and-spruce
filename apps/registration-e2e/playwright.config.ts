import { defineConfig, devices } from '@playwright/test';
import { workspaceRoot } from '@nx/devkit';

/**
 * Phase-1 E2E configuration: harness → emulator wiring.
 *
 * The job that runs this in CI boots Firebase emulators via
 * `firebase emulators:exec`, then invokes `nx run registration-e2e:e2e`.
 * Playwright's `webServer` block boots the Vite test harness on the
 * same process, and `globalSetup` seeds Firestore with the fixtures
 * the tests assume exist.
 *
 * Locally: run `pnpm exec firebase emulators:exec --project=maple-and-spruce-dev --only=auth,firestore,functions "pnpm exec nx run registration-e2e:e2e"` after building the function codebases.
 */
const offset = Number.parseInt(process.env['EMULATOR_PORT_OFFSET'] ?? '0', 10);
const harnessPort = 4173 + offset;
const baseURL = process.env['HARNESS_BASE_URL'] ?? `http://127.0.0.1:${harnessPort}`;

export default defineConfig({
  testDir: './src',
  testMatch: '**/*.spec.ts',
  // CI runs are non-flaky targets; one retry covers transient first-load
  // races where the harness server is up but emulator hasn't finished
  // installing functions yet.
  retries: process.env['CI'] ? 1 : 0,
  // One worker keeps the seeded Firestore deterministic — multiple
  // workers would race on the shared emulator.
  workers: 1,
  reporter: process.env['CI']
    ? [['html', { open: 'never' }], ['list']]
    : 'list',
  globalSetup: require.resolve('./src/global-setup.ts'),
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  webServer: {
    // Spawn Vite directly (not via `nx run …:serve`) so the @nx/playwright
    // plugin doesn't pick this up as a build-time `dependsOn` and try to
    // start the harness as a blocking prereq before Playwright runs. The
    // webServer model expects Playwright to manage the lifecycle itself.
    command: 'npx vite',
    url: baseURL,
    reuseExistingServer: !process.env['CI'],
    cwd: `${workspaceRoot}/apps/registration-test-harness`,
    timeout: 120_000,
    env: {
      EMULATOR_PORT_OFFSET: String(offset),
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
