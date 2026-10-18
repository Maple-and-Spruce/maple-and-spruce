/**
 * Portal users and their roles, served by the `people` router (admin-only).
 *
 * `admins/{uid}` is the source of truth for admin; `userRoles/{uid}` holds the
 * scoped roles (mt-teacher, clerk, lesson-teacher). The two are granted and
 * revoked separately, so the scoped-role routes refuse the admin role.
 */
import {
  Role,
  getAdminUids,
  getAllUserRoles,
  grantAdminRole as grantAdminRoleUtil,
  grantRole as grantRoleUtil,
  revokeAdminRole as revokeAdminRoleUtil,
  revokeRole as revokeRoleUtil,
  throwFailedPrecondition,
  throwInvalidArgument,
  type FunctionContext,
} from '@maple/firebase/functions';
import { getAuth } from 'firebase-admin/auth';
import { getApps, initializeApp } from 'firebase-admin/app';
import type { AppUser, ScopedUserRole } from '@maple/ts/domain';
import type {
  GetUsersRequest,
  GetUsersResponse,
  GrantAdminRoleRequest,
  GrantAdminRoleResponse,
  GrantRoleRequest,
  GrantRoleResponse,
  RevokeAdminRoleRequest,
  RevokeAdminRoleResponse,
  RevokeRoleRequest,
  RevokeRoleResponse,
} from '@maple/ts/firebase/api-types';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

/** Roles the scoped-role routes may grant or revoke: everything except admin. */
const SCOPED_ROLES = new Set<string>(
  Object.values(Role).filter((role) => role !== Role.Admin),
);

function ensureAdmin(): void {
  if (getApps().length === 0) initializeApp();
}

/**
 * Every Firebase Auth user, joined with the admin record and scoped roles.
 * Powers the /users page. Fetches the admin UID set up front, then walks the
 * auth page once, to avoid N+1 reads.
 */
export async function listUsers(
  data: GetUsersRequest,
): Promise<GetUsersResponse> {
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

  // Most recent sign-in first; users who never signed in (e.g. just created)
  // fall to the bottom in created-at order.
  users.sort((a, b) => {
    const aTime = a.lastSignInAt?.getTime() ?? 0;
    const bTime = b.lastSignInAt?.getTime() ?? 0;
    if (aTime !== bTime) return bTime - aTime;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return { users, hasMore: !!page.pageToken };
}

/** Promote a user to admin, recording the granting admin for audit. */
export async function grantAdminRole(
  data: GrantAdminRoleRequest,
  context: FunctionContext,
): Promise<GrantAdminRoleResponse> {
  if (!context.uid) throwInvalidArgument('Authentication required');
  if (!data.uid) throwInvalidArgument('Target user UID is required');

  await grantAdminRoleUtil(data.uid, context.uid);
  return { success: true };
}

/**
 * Remove a user's admin access. An admin cannot revoke their own: they would
 * lose /users on the next page load, with no way back in the app.
 */
export async function revokeAdminRole(
  data: RevokeAdminRoleRequest,
  context: FunctionContext,
): Promise<RevokeAdminRoleResponse> {
  if (!context.uid) throwInvalidArgument('Authentication required');
  if (!data.uid) throwInvalidArgument('Target user UID is required');

  if (data.uid === context.uid) {
    throwFailedPrecondition('You cannot revoke your own admin role');
  }

  await revokeAdminRoleUtil(data.uid);
  return { success: true };
}

/** Grant a scoped role, recording the granting admin for audit. */
export async function grantRole(
  data: GrantRoleRequest,
  context: FunctionContext,
): Promise<GrantRoleResponse> {
  if (!context.uid) throwInvalidArgument('Authentication required');
  if (!data.uid) throwInvalidArgument('Target user UID is required');
  if (!data.role || !SCOPED_ROLES.has(data.role)) {
    throwInvalidArgument(
      `Role must be one of: ${[...SCOPED_ROLES].join(', ')}`,
    );
  }

  await grantRoleUtil(data.uid, data.role as Role, context.uid);
  return { success: true };
}

export async function revokeRole(
  data: RevokeRoleRequest,
): Promise<RevokeRoleResponse> {
  if (!data.uid) throwInvalidArgument('Target user UID is required');
  if (!data.role || !SCOPED_ROLES.has(data.role)) {
    throwInvalidArgument(
      `Role must be one of: ${[...SCOPED_ROLES].join(', ')}`,
    );
  }

  await revokeRoleUtil(data.uid, data.role as Role);
  return { success: true };
}
