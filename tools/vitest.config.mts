import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../node_modules/.vite/tools',
  resolve: { tsconfigPaths: true },
  test: {
    name: 'tools',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['**/*.spec.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../coverage/tools',
      provider: 'istanbul' as const, // same provider as CI's merged run
    },
  },
}));
