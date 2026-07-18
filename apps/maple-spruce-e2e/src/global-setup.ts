/**
 * Playwright globalSetup: seed the Auth + Firestore emulators with the portal
 * users the specs sign in as.
 *
 * - ADMIN     -> Auth user + `admins/{uid}` doc
 * - MT_TEACHER -> Auth user + `userRoles/{uid}` doc (roles: ['mt-teacher'])
 *
 * Emulator-only (this e2e has no deployed-target mode). The Auth-emulator user
 * created here signs in through the real login form because the app connects
 * to the same Auth emulator (via NEXT_PUBLIC_AUTH_EMULATOR_PORT, set by the
 * webServer). Emulator state dies with the `emulators:exec` process, so
 * teardown is a no-op.
 */
import {
  clearAuthEmulator,
  clearFirestoreEmulator,
  createTestUser,
  setFirestoreDoc,
} from '@maple/firebase/integration-test-utils';
import { PORTAL_E2E_USERS } from './fixtures';

async function globalSetup(): Promise<void> {
  console.log('[portal-e2e] Seeding auth + firestore emulators…');
  await clearAuthEmulator();
  await clearFirestoreEmulator();

  for (const user of PORTAL_E2E_USERS) {
    const created = await createTestUser(user.email, user.password);
    if (user.seed.kind === 'admin') {
      await setFirestoreDoc('admins', created.uid, {
        userId: created.uid,
        email: created.email,
      });
    } else {
      await setFirestoreDoc('userRoles', created.uid, {
        roles: user.seed.roles,
      });
    }
    console.log(
      `[portal-e2e] Seeded ${user.email} (${
        user.seed.kind === 'admin' ? 'admin' : user.seed.roles.join(',')
      })`
    );
  }
}

export default globalSetup;
