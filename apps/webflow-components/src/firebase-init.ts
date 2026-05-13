/**
 * Standalone Firebase initialization for the Webflow widget.
 *
 * Avoids process.env and hostname detection used by the Next.js app.
 * Environment is passed explicitly as a prop from the Webflow component.
 */
import { initializeApp, getApps, type FirebaseOptions } from 'firebase/app';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const prodConfig: FirebaseOptions = {
  apiKey: 'AIzaSyCPcBR2xmErLQKo-fipRbM6pnOSbLMgi2U',
  authDomain: 'maple-and-spruce.firebaseapp.com',
  projectId: 'maple-and-spruce',
  storageBucket: 'maple-and-spruce.firebasestorage.app',
  messagingSenderId: '138840458966',
  appId: '1:138840458966:web:8c0975e42c94247abb6b77',
};

const devConfig: FirebaseOptions = {
  apiKey: 'AIzaSyAFCM6IHepC14MoMYQofiiye8v_gkYv5Cw',
  authDomain: 'maple-and-spruce-dev.firebaseapp.com',
  projectId: 'maple-and-spruce-dev',
  storageBucket: 'maple-and-spruce-dev.firebasestorage.app',
  messagingSenderId: '1062803455357',
  appId: '1:1062803455357:web:e1f3cf4cb54fb18dc6e014',
};

const FUNCTIONS_REGION = 'us-east4';

let cachedEnv: string | null = null;
let emulatorConnected = false;

/**
 * Resolve the local emulator host:port for `env="emulator"`. Host is
 * always 127.0.0.1; the port comes from a global the harness sets at
 * boot (`globalThis.__MAPLE_FUNCTIONS_EMULATOR_PORT__`) and defaults
 * to the Firebase default 5001 when the global isn't there.
 *
 * The global indirection (instead of `import.meta.env`) keeps this
 * file compatible with the CommonJS tsconfig the Webflow component
 * build uses — `import.meta` triggers TS1470 there. The Vite harness
 * sets the global from its own ESM entry point.
 */
function getEmulatorEndpoint(): { host: string; port: number } {
  const port =
    (globalThis as { __MAPLE_FUNCTIONS_EMULATOR_PORT__?: number })
      .__MAPLE_FUNCTIONS_EMULATOR_PORT__ ?? 5001;
  return { host: '127.0.0.1', port };
}

export function getWidgetFunctions(env: string) {
  // 'emulator' uses the dev project so projectId/region match what
  // `firebase emulators:exec --project=maple-and-spruce-dev` boots.
  const config = env === 'prod' ? prodConfig : devConfig;

  if (getApps().length === 0 || cachedEnv !== env) {
    if (getApps().length === 0) {
      initializeApp(config);
    }
    cachedEnv = env;
  }

  const functions = getFunctions(undefined, FUNCTIONS_REGION);

  if (env === 'emulator' && !emulatorConnected) {
    const { host, port } = getEmulatorEndpoint();
    connectFunctionsEmulator(functions, host, port);
    emulatorConnected = true;
  }

  return functions;
}
