import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@maple/firebase/integration-test-utils': path.resolve(
        __dirname,
        '../../libs/firebase/integration-test-utils/src/index.ts'
      ),
      '@maple/firebase/square-test-mock-server': path.resolve(
        __dirname,
        '../../libs/firebase/square-test-mock-server/src/index.ts'
      ),
      '@maple/ts/firebase/api-types': path.resolve(
        __dirname,
        '../../libs/ts/firebase/api-types/src/index.ts'
      ),
      '@maple/ts/domain': path.resolve(
        __dirname,
        '../../libs/ts/domain/src/index.ts'
      ),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    root: path.resolve(__dirname),
    include: ['src/**/*.spec.ts'],
    setupFiles: ['../../libs/firebase/integration-test-utils/src/lib/setup.ts'],
    // TRIGGER_SUITE_TEST_TIMEOUT_MS (integration-test-utils/trigger-wait.ts):
    // room for two full trigger waits on a slow CI runner. pos-sale-webhook
    // test B polls twice (registration, then the admin alert).
    testTimeout: 120_000,
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
  },
});
