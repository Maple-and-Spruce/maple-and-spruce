import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getMapleApp } from './maple-app';

let _mapleAuth: ReturnType<typeof getAuth> | undefined;

/**
 * Auth-emulator port. Unlike the Functions emulator (which the app connects to
 * automatically on localhost), auth-emulator wiring is OPT-IN: it only kicks in
 * when `NEXT_PUBLIC_AUTH_EMULATOR_PORT` is set. That keeps normal local dev
 * (real dev Auth) unchanged, and lets the portal e2e run the whole app against
 * the Auth emulator by setting this var.
 */
// Dot access (not bracket) so Next inlines the value into the browser bundle —
// `process.env['NEXT_PUBLIC_…']` is NOT statically replaced and reads undefined
// client-side.
const AUTH_EMULATOR_PORT = process.env.NEXT_PUBLIC_AUTH_EMULATOR_PORT;

export const getMapleAuth = () => {
  if (!_mapleAuth) {
    _mapleAuth = getAuth(getMapleApp());

    // Connect to the local Auth emulator only on localhost AND only when the
    // port is explicitly provided (e.g. by the e2e harness).
    if (
      AUTH_EMULATOR_PORT &&
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1')
    ) {
      connectAuthEmulator(
        _mapleAuth,
        `http://localhost:${AUTH_EMULATOR_PORT}`,
        { disableWarnings: true }
      );
    }
  }
  return _mapleAuth;
};
