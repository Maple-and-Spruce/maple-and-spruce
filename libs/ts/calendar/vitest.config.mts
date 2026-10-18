import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/ts/calendar',
  resolve: { tsconfigPaths: true },
  test: {
    name: 'ts-calendar',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/ts/calendar',
      provider: 'istanbul' as const, // same provider as CI's merged run
    },
  },
}));
