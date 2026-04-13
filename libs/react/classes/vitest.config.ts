import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  root: __dirname,
  test: {
    name: 'react-classes',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary', 'json'],
      reportsDirectory: '../../../coverage/libs/react/classes',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.spec.{ts,tsx}',
        'src/**/*.stories.tsx',
        'src/index.ts',
        'src/test-setup.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@maple/ts/domain': resolve(__dirname, '../../../libs/ts/domain/src/index.ts'),
      '@maple/ts/validation': resolve(__dirname, '../../../libs/ts/validation/src/index.ts'),
      '@maple/ts/firebase/api-types': resolve(__dirname, '../../../libs/ts/firebase/api-types/src/index.ts'),
      '@maple/ts/firebase/firebase-config': resolve(__dirname, '../../../libs/ts/firebase/firebase-config/src/index.ts'),
      '@maple/react/ui': resolve(__dirname, '../../../libs/react/ui/src/index.ts'),
      '@maple/react/signals': resolve(__dirname, '../../../libs/react/signals/src/index.ts'),
    },
  },
});
