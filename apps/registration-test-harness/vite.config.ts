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
const squareApplicationId = process.env['VITE_SQUARE_APPLICATION_ID'] ?? '';
const squareLocationId = process.env['VITE_SQUARE_LOCATION_ID'] ?? '';
// Music Together uses a SEPARATE Square account (Stephanie's LLC). When the
// harness mounts the MT widget (`?mtSectionId=`), tokenization must bind to
// MT's sandbox app so payment routes to MT's account, not Maple & Spruce's.
const mtSquareApplicationId =
  process.env['VITE_MT_SQUARE_APPLICATION_ID'] ?? '';
const mtSquareLocationId = process.env['VITE_MT_SQUARE_LOCATION_ID'] ?? '';

export default defineConfig({
  root: __dirname,
  plugins: [
    react(),
    tsconfigPaths({
      projects: [resolve(__dirname, '../../tsconfig.base.json')],
    }),
  ],
  // Bind to `localhost` (not 127.0.0.1) — Square's Web Payments SDK
  // explicitly allows `localhost` as a secure-context exception, but
  // raw IPs (127.0.0.1) trip its "HTTPS required" rejection even
  // though Chromium considers both equivalent.
  server: {
    port: harnessPort,
    strictPort: true,
    host: 'localhost',
  },
  preview: {
    port: harnessPort,
    strictPort: true,
    host: 'localhost',
  },
  // Forward selected process.env values into the client bundle. Vite's
  // automatic VITE_*-from-.env loading doesn't read process.env, so
  // anything CI sets must be mirrored explicitly here.
  define: {
    'import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT': JSON.stringify(
      String(functionsPort)
    ),
    'import.meta.env.VITE_TARGET_ENV': JSON.stringify(targetEnv),
    'import.meta.env.VITE_SQUARE_APPLICATION_ID':
      JSON.stringify(squareApplicationId),
    'import.meta.env.VITE_SQUARE_LOCATION_ID':
      JSON.stringify(squareLocationId),
    'import.meta.env.VITE_MT_SQUARE_APPLICATION_ID':
      JSON.stringify(mtSquareApplicationId),
    'import.meta.env.VITE_MT_SQUARE_LOCATION_ID':
      JSON.stringify(mtSquareLocationId),
  },
});
