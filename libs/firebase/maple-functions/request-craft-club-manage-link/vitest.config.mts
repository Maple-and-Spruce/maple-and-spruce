import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir:
    '../../../../node_modules/.vite/libs/firebase/maple-functions/request-craft-club-manage-link',
  resolve: { tsconfigPaths: true },
  test: {
    name: 'firebase-maple-functions-request-craft-club-manage-link',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory:
        '../../../../coverage/libs/firebase/maple-functions/request-craft-club-manage-link',
      provider: 'istanbul' as const, // same provider as CI's merged run
    },
  },
}));
