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
 * Determine if we're in development mode based on hostname:
 * - localhost, 127.0.0.1 = dev (local development)
 * - *-dev.* hostname = dev (e.g., business-dev.mapleandsprucefolkarts.com)
 * - Everything else = prod
 */
function isDevelopment(): boolean {
  if (typeof window === 'undefined') {
    // Server-side: check NODE_ENV
    return process.env['NODE_ENV'] === 'development';
  }
  // Client-side: check hostname
  const hostname = window.location.hostname;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.includes('-dev.')      // business-dev.mapleandsprucefolkarts.com
  );
}

/**
 * Firebase configuration - automatically selects dev or prod based on environment
 */
export const mapleFirebaseConfig: FirebaseOptions = isDevelopment() ? devConfig : prodConfig;
