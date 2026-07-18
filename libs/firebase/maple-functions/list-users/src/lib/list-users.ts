/**
 * List Users Cloud Function
 *
 * Admin-only listing of every Firebase Auth user, joined with the admin
 * role record. Powers the /users admin page.
 *
 * Avoids N+1 reads by fetching the admin UID set up-front, then walking
 * the auth page once.
 */
import {
  createAdminFunction,
  getAdminUids,
  getAllUserRoles,
  throwInvalidArgument,
} from '@maple/firebase/functions';
import { getAuth } from 'firebase-admin/auth';
import { getApps, initializeApp } from 'firebase-admin/app';
import type { AppUser, ScopedUserRole } from '@maple/ts/domain';
import type {
  GetUsersRequest,
  GetUsersResponse,
} from '@maple/ts/firebase/api-types';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

function ensureAdmin(): void {
  if (getApps().length === 0) initializeApp();
}

export const listUsers = createAdminFunction<
  GetUsersRequest,
  GetUsersResponse
>(async (data) => {
  const requested = data.limit ?? DEFAULT_LIMIT;
  if (requested <= 0) {
    throwInvalidArgument('Limit must be greater than 0');
  }
  const limit = Math.min(requested, MAX_LIMIT);

  ensureAdmin();

  const [adminUids, rolesByUid, page] = await Promise.all([
    getAdminUids(),
    getAllUserRoles(),
    getAuth().listUsers(limit),
  ]);

  const adminSet = new Set(adminUids);

  const users: AppUser[] = page.users.map((u) => ({
    uid: u.uid,
    email: u.email ?? null,
    displayName: u.displayName,
    photoUrl: u.photoURL,
    emailVerified: u.emailVerified,
    disabled: u.disabled,
    createdAt: new Date(u.metadata.creationTime),
    lastSignInAt: u.metadata.lastSignInTime
      ? new Date(u.metadata.lastSignInTime)
      : undefined,
    isAdmin: adminSet.has(u.uid),
    // Role enum wire values are the ScopedUserRole strings; 'admin' never
    // appears here (grantRole rejects it — admins/{uid} is authoritative)
    roles: (rolesByUid.get(u.uid) ?? []) as ScopedUserRole[],
  }));

  // Sort: most recent sign-in first; users who never signed in (e.g. just
  // created) fall to the bottom in created-at order.
  users.sort((a, b) => {
    const aTime = a.lastSignInAt?.getTime() ?? 0;
    const bTime = b.lastSignInAt?.getTime() ?? 0;
    if (aTime !== bTime) return bTime - aTime;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return {
    users,
    hasMore: !!page.pageToken,
  };
});
