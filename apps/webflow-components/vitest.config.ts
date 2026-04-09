import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  test: {
    name: 'webflow-components',
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary', 'json'],
      reportsDirectory: '../../coverage/apps/webflow-components',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/**/*.spec.ts'],
    },
  },
});
