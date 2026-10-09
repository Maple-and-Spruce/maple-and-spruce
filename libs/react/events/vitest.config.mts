import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/react/events',
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    name: 'react-events',
    watch: false,
    globals: true,
    // Specs that need a DOM opt in per file: // @vitest-environment jsdom
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/react/events',
      provider: 'istanbul' as const, // same provider as CI's merged run
    },
  },
}));
