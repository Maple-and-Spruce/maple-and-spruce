import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@maple/firebase/integration-test-utils': path.resolve(
        __dirname,
        '../../libs/firebase/integration-test-utils/src/index.ts'
      ),
      '@maple/firebase/ga4-test-mock-server': path.resolve(
        __dirname,
        '../../libs/firebase/ga4-test-mock-server/src/index.ts'
      ),
      '@maple/firebase/meta-capi-test-mock-server': path.resolve(
        __dirname,
        '../../libs/firebase/meta-capi-test-mock-server/src/index.ts'
      ),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    root: path.resolve(__dirname),
    include: ['src/**/*.spec.ts'],
    setupFiles: ['../../libs/firebase/integration-test-utils/src/lib/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
  },
});
