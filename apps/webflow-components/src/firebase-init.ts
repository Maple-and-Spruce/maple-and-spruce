/**
 * Standalone Firebase initialization for the Webflow widget.
 *
 * Avoids process.env and hostname detection used by the Next.js app.
 * Environment is passed explicitly as a prop from the Webflow component.
 */
import { initializeApp, getApps, type FirebaseOptions } from 'firebase/app';
import { getFunctions } from 'firebase/functions';

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

export function getWidgetFunctions(env: string) {
  const config = env === 'dev' ? devConfig : prodConfig;

  // Only initialize if not already done (or if env changed)
  if (getApps().length === 0 || cachedEnv !== env) {
    if (getApps().length === 0) {
      initializeApp(config);
    }
    cachedEnv = env;
  }

  return getFunctions(undefined, FUNCTIONS_REGION);
}
