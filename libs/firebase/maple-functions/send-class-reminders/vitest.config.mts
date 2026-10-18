import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir:
    '../../../../node_modules/.vite/libs/firebase/maple-functions/send-class-reminders',
  resolve: { tsconfigPaths: true },
  test: {
    name: 'firebase-maple-functions-send-class-reminders',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory:
        '../../../../coverage/libs/firebase/maple-functions/send-class-reminders',
      provider: 'istanbul' as const, // same provider as CI's merged run
    },
  },
}));
