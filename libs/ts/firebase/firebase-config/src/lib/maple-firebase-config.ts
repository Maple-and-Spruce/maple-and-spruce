import { FirebaseOptions } from 'firebase/app';

/**
 * Production Firebase configuration
 */
const prodConfig: FirebaseOptions = {
  apiKey: 'AIzaSyCPcBR2xmErLQKo-fipRbM6pnOSbLMgi2U',
  authDomain: 'maple-and-spruce.firebaseapp.com',
  projectId: 'maple-and-spruce',
  storageBucket: 'maple-and-spruce.firebasestorage.app',
  messagingSenderId: '138840458966',
  appId: '1:138840458966:web:8c0975e42c94247abb6b77',
  measurementId: 'G-TY0E9X31V6',
};

/**
 * Development Firebase configuration
 * Uses maple-and-spruce-dev project for isolated testing
 */
const devConfig: FirebaseOptions = {
  apiKey: 'AIzaSyAFCM6IHepC14MoMYQofiiye8v_gkYv5Cw',
  authDomain: 'maple-and-spruce-dev.firebaseapp.com',
  projectId: 'maple-and-spruce-dev',
  storageBucket: 'maple-and-spruce-dev.firebasestorage.app',
  messagingSenderId: '1062803455357',
  appId: '1:1062803455357:web:e1f3cf4cb54fb18dc6e014',
  measurementId: 'G-XGYBP0X174',
};

/**
 * Determine if we're in development mode:
 * 1. Check NEXT_PUBLIC_FIREBASE_ENV (set in Vercel for deployed apps)
 * 2. Fall back to hostname detection (for local development)
 */
function isDevelopment(): boolean {
  // Check environment variable first (works on both server and client)
  const firebaseEnv = process.env['NEXT_PUBLIC_FIREBASE_ENV'];
  if (firebaseEnv) {
    return firebaseEnv === 'dev';
  }

  // Fall back to hostname detection for local development
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.includes('-dev.')
    );
  }

  // Server-side without env var: default to dev for safety
  return true;
}

/**
 * Firebase configuration - automatically selects dev or prod based on environment
 */
export const mapleFirebaseConfig: FirebaseOptions = isDevelopment() ? devConfig : prodConfig;
