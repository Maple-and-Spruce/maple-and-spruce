import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  root: __dirname,
  test: {
    name: 'validation',
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: '../../../coverage/libs/ts/validation',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/index.ts'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@maple/ts/domain': resolve(__dirname, '../domain/src/index.ts'),
    },
  },
});
