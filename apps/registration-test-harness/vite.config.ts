import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { resolve } from 'path';

/**
 * Vite config for the registration E2E harness.
 *
 * Two build/serve modes, picked by `VITE_TARGET_ENV`:
 * - `emulator` (default) — Phase 1: widget calls 127.0.0.1 emulator on
 *   `VITE_FUNCTIONS_EMULATOR_PORT` (5001 + EMULATOR_PORT_OFFSET).
 * - `dev` — Phase 2: widget calls deployed dev project callables.
 *   Bundled with `vite build` and deployed to Firebase Hosting site
 *   `maple-spruce-registration-test` (see `firebase.json`).
 *
 * `EMULATOR_PORT_OFFSET` shifts the local dev server + emulator port
 * so two worktrees can run their own harness side-by-side without
 * colliding.
 */
const offset = Number.parseInt(process.env['EMULATOR_PORT_OFFSET'] ?? '0', 10);
const harnessPort = 4173 + offset;
const functionsPort = 5001 + offset;
const targetEnv = process.env['VITE_TARGET_ENV'] ?? 'emulator';

export default defineConfig({
  root: __dirname,
  plugins: [
    react(),
    tsconfigPaths({
      projects: [resolve(__dirname, '../../tsconfig.base.json')],
    }),
  ],
  server: {
    port: harnessPort,
    strictPort: true,
    host: '127.0.0.1',
  },
  preview: {
    port: harnessPort,
    strictPort: true,
    host: '127.0.0.1',
  },
  define: {
    'import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT': JSON.stringify(
      String(functionsPort)
    ),
    'import.meta.env.VITE_TARGET_ENV': JSON.stringify(targetEnv),
  },
});
