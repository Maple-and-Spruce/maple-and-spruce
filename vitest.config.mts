import { defineConfig } from 'vitest/config';

/**
 * Root vitest config: orchestrates every project's own `vitest.config.mts`
 * (Vitest `test.projects`) so CI gets ONE merged coverage report.
 *
 * Each unit-tested Nx project owns a `vitest.config.mts`; the `@nx/vitest`
 * plugin infers its `test` target from it, so `nx test <project>`,
 * `nx affected -t test` and `nx run-many -t test` (= `pnpm test`) work per
 * project with caching. This file is the workspace-level run of the same
 * configs, which CI uses for the merged coverage gate:
 *
 *   pnpm exec vitest run --coverage
 *
 * `projects` is a GLOB, never a hand-kept list. An explicit list is how the
 * Nx 23 migration silently dropped ~90 spec files from the run. A spec that
 * sits outside every project's `include` is still not run, so
 * `tools/check-vitest-projects.ts` (CI) fails on any such orphan.
 *
 * Emulator-backed integration suites and pos-sandbox-e2e are NOT projects
 * here: they get an `e2e` target instead (see nx.json) and run with an
 * explicit `--config`.
 *
 * Coverage options are root-only in projects mode, so they live here.
 */
export default defineConfig({
  test: {
    projects: [
      '{apps,libs,tools}/**/vitest.config.mts',
      '!**/dist/**',
      '!apps/functions-integration-tests*/**',
      '!apps/pos-sandbox-e2e/**',
    ],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json-summary', 'json'],
      reportsDirectory: './coverage/unit',
      // Vitest 4 removed `coverage.all`; its default (report only files loaded
      // during the run) already matches the previous `all: false` behavior.
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
        'apps/pos-sandbox-e2e/**',
        'apps/music-together-e2e/**',
        'apps/maple-spruce-e2e/**',
        'apps/maple-spruce/.storybook/**',
      ],
      // Coverage thresholds enforced in CI via nyc check-coverage after
      // merging unit + Storybook coverage reports. See build-check.yml.
      // Local reference: lines 80%, functions 80%, statements 80%, branches 50%
    },
  },
});
