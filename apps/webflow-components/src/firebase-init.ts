/**
 * Standalone Firebase initialization for the Webflow widget.
 *
 * Avoids process.env and hostname detection used by the Next.js app.
 * Environment is passed explicitly as a prop from the Webflow component.
 */
import {
  initializeApp,
  getApps,
  type FirebaseApp,
  type FirebaseOptions,
} from 'firebase/app';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  CustomProvider,
} from 'firebase/app-check';
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

/**
 * reCAPTCHA Enterprise site keys for App Check (ADR-034), per project.
 *
 * Site keys are public identifiers, like the apiKey above. While a key is
 * empty, App Check is not initialized for that project and calls go out
 * without a token, which the functions accept in `monitor` mode.
 */
export const RECAPTCHA_ENTERPRISE_SITE_KEY: Record<'prod' | 'dev', string> = {
  prod: '',
  dev: '',
};

let cachedEnv: string | null = null;
let emulatorConnected = false;
let appCheckInitialized = false;

/**
 * Stories and harnesses can set `globalThis.__MAPLE_APP_CHECK_TEST_TOKEN__`
 * to have every call carry a fixed App Check token, without reCAPTCHA.
 * Same global indirection as the emulator port below.
 */
function getTestAppCheckToken(): string | undefined {
  return (globalThis as { __MAPLE_APP_CHECK_TEST_TOKEN__?: string })
    .__MAPLE_APP_CHECK_TEST_TOKEN__;
}

/**
 * Start App Check once per page, in the browser only.
 *
 * Code components server-render a static shell, so this must not run there.
 * Never throws: a widget that cannot get a token still works, and the
 * function decides what an untokened call is worth.
 */
function ensureAppCheck(app: FirebaseApp, env: string): void {
  if (appCheckInitialized || typeof window === 'undefined') return;

  const testToken = getTestAppCheckToken();
  const siteKey =
    env === 'prod'
      ? RECAPTCHA_ENTERPRISE_SITE_KEY.prod
      : env === 'dev'
        ? RECAPTCHA_ENTERPRISE_SITE_KEY.dev
        : '';
  if (!testToken && !siteKey) return;

  try {
    initializeAppCheck(app, {
      provider: testToken
        ? new CustomProvider({
            getToken: async () => ({
              token: testToken,
              expireTimeMillis: Date.now() + 60 * 60 * 1000,
            }),
          })
        : new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckInitialized = true;
  } catch (error) {
    console.warn('[maple] App Check unavailable', error);
  }
}

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

  ensureAppCheck(getApps()[0], env);

  const functions = getFunctions(undefined, FUNCTIONS_REGION);

  if (env === 'emulator' && !emulatorConnected) {
    const { host, port } = getEmulatorEndpoint();
    connectFunctionsEmulator(functions, host, port);
    emulatorConnected = true;
  }

  return functions;
}
