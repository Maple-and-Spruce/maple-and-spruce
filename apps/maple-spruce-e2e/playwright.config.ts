import { defineConfig, devices } from '@playwright/test';
import { workspaceRoot } from '@nx/devkit';

/**
 * Admin-portal role-scoping E2E — drives the real Next.js app
 * (`apps/maple-spruce`) against the local Firebase emulators (auth + firestore
 * + functions with the PR's own code). The first browser-level proof that the
 * scoped-roles wiring holds in the assembled app (epic #617).
 *
 * Run via `tools/run-portal-e2e.sh`, which starts the emulators and then
 * `nx run maple-spruce-e2e:e2e`. Playwright's own `webServer` boots the Next
 * dev server on localhost, pointed at the offset emulator ports so the app's
 * callables + sign-in hit the emulators.
 */
// Next dev is pinned to 3000 (nx's dev target doesn't reliably forward a port).
// The app reaches the (possibly offset) emulators via the ports written to
// apps/maple-spruce/.env.local by the run script / CI.
const baseURL = 'http://localhost:3000';

export default defineConfig({
  testDir: './src',
  testMatch: '**/*.spec.ts',
  retries: process.env['CI'] ? 1 : 0,
  // One worker: the specs share seeded users on a single emulator backend.
  workers: 1,
  reporter: process.env['CI']
    ? [['html', { open: 'never' }], ['list']]
    : 'list',
  globalSetup: require.resolve('./src/global-setup.ts'),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  webServer: {
    // `next dev` (no separate build step). The app connects to the emulators
    // by hostname (localhost) + the NEXT_PUBLIC_*_EMULATOR_PORT vars, which the
    // run script / CI write into apps/maple-spruce/.env.local (the reliable
    // channel — process.env NEXT_PUBLIC vars don't reach the client bundle
    // through nx → next dev). Not reused in CI so a fresh env is always picked.
    command: 'npx nx run maple-spruce:dev',
    url: baseURL,
    reuseExistingServer: !process.env['CI'],
    cwd: workspaceRoot,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
