import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      '@maple/firebase/webflow-test-mock-server': resolve(
        __dirname,
        '../../../libs/firebase/webflow-test-mock-server/src/index.ts'
      ),
    },
  },
  test: {
    name: 'webflow',
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary', 'json'],
      reportsDirectory: '../../../coverage/libs/firebase/webflow',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/index.ts'],
    },
  },
});
