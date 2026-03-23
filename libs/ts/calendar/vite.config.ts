import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@maple/ts/domain': resolve(__dirname, '../../../libs/ts/domain/src/index.ts'),
    },
  },
  test: {
    globals: true,
  },
});
