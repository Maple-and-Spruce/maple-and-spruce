import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/maple-spruce',
  plugins: [
    react(),
    // Not Vite's native `resolve.tsconfigPaths`: this app's tsconfig.json is
    // Next's, which excludes specs and has no reference to tsconfig.spec.json,
    // so native lookup finds no `paths` for a spec. Resolve from the base.
    tsconfigPaths({ root: '../../', projects: ['tsconfig.base.json'] }),
  ],
  test: {
    name: 'maple-spruce',
    watch: false,
    globals: true,
    // Specs that need a DOM opt in per file: // @vitest-environment jsdom
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/maple-spruce',
      provider: 'istanbul' as const, // same provider as CI's merged run
    },
  },
}));
