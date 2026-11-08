import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Unit tests for the e2e seeds, not the e2e itself. Playwright owns
 * `*.spec.ts` here (playwright.config.ts), so unit tests are `*.test.ts`.
 */
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/maple-spruce-e2e',
  plugins: [tsconfigPaths({ root: '../../', projects: ['tsconfig.base.json'] })],
  test: {
    name: 'maple-spruce-e2e',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/maple-spruce-e2e',
      provider: 'istanbul' as const,
    },
  },
}));
