/*
 * Seeded portal users, shared between the Playwright global-setup (which
 * creates them in the Auth + Firestore emulators) and the specs (which sign
 * in through the real login UI). Passwords must be >= 6 chars (Firebase).
 *
 * `.test` TLD keeps these out of any real mail path; the Auth emulator
 * accepts any syntactically valid email. The passwords below are throwaway
 * emulator-only test credentials, not secrets.
 */
/* eslint-disable sonarjs/no-hardcoded-passwords -- emulator-only test creds */
export interface PortalE2EUser {
  email: string;
  password: string;
  /** How this user is seeded: an `admins/{uid}` doc, or `userRoles/{uid}`. */
  seed:
    | { kind: 'admin' }
    | { kind: 'roles'; roles: string[] };
}

export const ADMIN: PortalE2EUser = {
  email: 'portal-e2e-admin@maplespruce.test',
  password: 'e2e-password-123',
  seed: { kind: 'admin' },
};

export const MT_TEACHER: PortalE2EUser = {
  email: 'portal-e2e-mt-teacher@maplespruce.test',
  password: 'e2e-password-123',
  seed: { kind: 'roles', roles: ['mt-teacher'] },
};

export const PORTAL_E2E_USERS: PortalE2EUser[] = [ADMIN, MT_TEACHER];
