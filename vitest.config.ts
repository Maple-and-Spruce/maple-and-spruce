import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Root vitest config for workspace-level coverage reporting.
 *
 * This config is used by CI to generate merged coverage reports
 * across all workspace projects. Individual project configs in
 * libs/ handle their own test execution.
 *
 * Run with: npx vitest run --coverage
 *
 * @see vitest.workspace.ts for the list of project configs
 */
export default defineConfig({
  plugins: [
    tsconfigPaths({
      projects: ['tsconfig.base.json'],
    }),
  ],
  test: {
    // Exclude Playwright e2e tests - they use a different test runner
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '.claude/**',
      'apps/maple-spruce-e2e/**',
      'apps/functions-integration-tests/**',
      'apps/functions-integration-tests-*/**',
    ],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json-summary', 'json'],
      reportsDirectory: './coverage/unit',
      // Merge coverage from all workspace projects
      all: false,
      // Exclude test infrastructure + integration-test harness code from
      // coverage — it's not production code and is only exercised by the
      // (emulator-backed) integration tests, which don't run in the unit
      // coverage path.
      exclude: [
        '**/*.spec.ts',
        '**/*.spec.tsx',
        '**/*.stories.tsx',
        'libs/firebase/square-test-mock-server/**',
        'libs/firebase/webflow-test-mock-server/**',
        'libs/firebase/etsy-test-mock-server/**',
        'libs/firebase/integration-test-utils/**',
        'apps/functions-integration-tests*/**',
        'apps/maple-spruce-e2e/**',
        'apps/maple-spruce/.storybook/**',
      ],
      // Coverage thresholds enforced in CI via nyc check-coverage after
      // merging unit + Storybook coverage reports. See build-check.yml.
      // Local reference: lines 80%, functions 80%, statements 80%, branches 50%
    },
  },
});
