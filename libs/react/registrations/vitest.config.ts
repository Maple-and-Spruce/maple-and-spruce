import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  root: __dirname,
  resolve: {
    // Resolve @maple/* workspace aliases via tsconfig paths (native Vite
    // support). The explicit @maple/react/signals alias is kept so the
    // local signals entry wins — the tsconfig path resolves to the same
    // file but goes through a slower lookup.
    tsconfigPaths: true,
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
