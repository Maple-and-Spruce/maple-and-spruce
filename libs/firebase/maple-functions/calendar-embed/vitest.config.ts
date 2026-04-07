import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  root: __dirname,
  test: {
    name: 'firebase-maple-functions-calendar-embed',
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary', 'json'],
      reportsDirectory: '../../../../coverage/libs/firebase/maple-functions/calendar-embed',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/index.ts'],
    },
  },
  resolve: {
    alias: {
      '@maple/firebase/database': resolve(__dirname, '../../../firebase/database/src/index.ts'),
    },
  },
});
