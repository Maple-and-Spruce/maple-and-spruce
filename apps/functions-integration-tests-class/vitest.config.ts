import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@maple/firebase/integration-test-utils': path.resolve(
        __dirname,
        '../../libs/firebase/integration-test-utils/src/index.ts'
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
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
  },
});
