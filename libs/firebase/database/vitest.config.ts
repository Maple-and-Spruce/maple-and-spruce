import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  root: __dirname,
  test: {
    name: 'firebase-database',
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary', 'json'],
      reportsDirectory: '../../../coverage/libs/firebase/database',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/index.ts'],
    },
  },
  resolve: {
    alias: {
      '@maple/ts/domain': resolve(__dirname, '../../ts/domain/src/index.ts'),
    },
  },
});
