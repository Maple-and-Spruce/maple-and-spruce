import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  root: __dirname,
  test: {
    name: 'firebase-maple-functions-mark-payout-paid',
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary', 'json'],
      reportsDirectory:
        '../../../../coverage/libs/firebase/maple-functions/mark-payout-paid',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/index.ts'],
    },
  },
  resolve: {
    alias: {
      '@maple/ts/domain': resolve(__dirname, '../../../ts/domain/src/index.ts'),
      '@maple/ts/validation': resolve(
        __dirname,
        '../../../ts/validation/src/index.ts'
      ),
      '@maple/ts/firebase/api-types': resolve(
        __dirname,
        '../../../ts/firebase/api-types/src/index.ts'
      ),
      '@maple/firebase/database': resolve(
        __dirname,
        '../../../firebase/database/src/index.ts'
      ),
      '@maple/firebase/functions': resolve(
        __dirname,
        '../../../firebase/functions/src/index.ts'
      ),
    },
  },
});
