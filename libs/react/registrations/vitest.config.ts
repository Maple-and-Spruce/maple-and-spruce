import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  root: __dirname,
  resolve: {
    // Point @maple/react/signals at the real lib entry so vitest can
    // resolve it without a full tsconfig-paths plugin. Tests can still
    // mock specific exports via vi.mock.
    alias: {
      '@maple/react/signals': path.resolve(__dirname, '../signals/src/index.ts'),
    },
  },
  test: {
    name: 'react-registrations',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary', 'json'],
      reportsDirectory: '../../../coverage/libs/react/registrations',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.spec.{ts,tsx}',
        'src/**/*.stories.tsx',
        'src/index.ts',
        'src/test-setup.ts',
      ],
    },
  },
});
