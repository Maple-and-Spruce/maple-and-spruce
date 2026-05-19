import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { resolve } from 'path';

/**
 * Minimal Vite config for the E2E test harness.
 *
 * - `tsconfigPaths` resolves `@maple/*` aliases from the root
 *   tsconfig.base.json so we don't redeclare them here.
 * - The dev server port (default 4173) and emulator port (default 5001)
 *   can both be shifted via `EMULATOR_PORT_OFFSET` so a parallel
 *   worktree can run its own harness without colliding.
 *   `VITE_FUNCTIONS_EMULATOR_PORT` is read at runtime by
 *   `firebase-init.ts` to wire `connectFunctionsEmulator` to the
 *   right port.
 */
const offset = Number.parseInt(process.env['EMULATOR_PORT_OFFSET'] ?? '0', 10);
const harnessPort = 4173 + offset;
const functionsPort = 5001 + offset;

export default defineConfig({
  root: __dirname,
  plugins: [
    react(),
    tsconfigPaths({
      // tsconfig.base.json holds the workspace path mapping.
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
  },
});
