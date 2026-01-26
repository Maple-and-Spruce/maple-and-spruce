import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  test: {
    name: 'firebase-functions',
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary', 'json'],
      reportsDirectory: '../../../coverage/libs/firebase/functions',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/index.ts'],
    },
  },
});
