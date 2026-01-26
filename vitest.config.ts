import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

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
  test: {
    // Exclude Playwright e2e tests - they use a different test runner
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'apps/maple-spruce-e2e/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      reportsDirectory: './coverage',
      // Merge coverage from all workspace projects
      all: false,
      // Fail CI if coverage drops below 80%
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 50, // Branches often lower due to error handling paths
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@maple/ts/domain': resolve(__dirname, 'libs/ts/domain/src/index.ts'),
      '@maple/ts/validation': resolve(__dirname, 'libs/ts/validation/src/index.ts'),
      '@maple/firebase/database': resolve(__dirname, 'libs/firebase/database/src/index.ts'),
      '@maple/firebase/functions': resolve(__dirname, 'libs/firebase/functions/src/index.ts'),
      '@maple/firebase/square': resolve(__dirname, 'libs/firebase/square/src/index.ts'),
      '@maple/firebase/webflow': resolve(__dirname, 'libs/firebase/webflow/src/index.ts'),
    },
  },
});
