/**
 * Authentication and authorization utilities
 *
 * Role-based authorization for Firebase Cloud Functions.
 *
 * IMPORTANT: This module avoids cold start delays by NOT initializing
 * Firebase Admin at module level. Uses getDb() from database config for
 * lazy Firestore initialization with proper settings.
 *
 * Pattern adapted from Mountain Sol Platform:
 * @see https://github.com/MountainSOLSchool/platform/blob/main/libs/firebase/functions/src/lib/utilities/auth.utility.ts
 */
import { getDb } from '@maple/firebase/database';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Roles available in the system
 */
export enum Role {
  /** Full administrative access */
  Admin = 'admin',
  /** Manage the Music Together program (sections, semesters, rosters, registrations) */
  MtTeacher = 'mt-teacher',
  /** Operational access: POS checkout, registrations & rosters, store inventory & orders, refunds */
  Clerk = 'clerk',
  /** Music lesson teacher: read all lessons, manage own (scoping lands in phase 2) */
  LessonTeacher = 'lesson-teacher',
}

/** Firestore collection holding non-admin role grants, keyed by UID */
const USER_ROLES_COLLECTION = 'userRoles';

/** Shape of a `userRoles/{uid}` document */
interface UserRolesDoc {
  roles?: unknown;
  grantedBy?: string;
  updatedAt?: Date;
}

/** All enum values, for filtering unknown strings out of stored role arrays */
const KNOWN_ROLES = new Set<string>(Object.values(Role));

/**
 * Read the non-admin roles stored on `userRoles/{uid}`.
 *
 * Unknown strings (e.g. roles removed from the enum) are filtered out.
 */
async function getStoredRoles(uid: string): Promise<Role[]> {
  const db = getDb();
  const doc = await db.collection(USER_ROLES_COLLECTION).doc(uid).get();
  if (!doc.exists) return [];
  const roles = (doc.data() as UserRolesDoc).roles;
  if (!Array.isArray(roles)) return [];
  return roles.filter(
    (role): role is Role => typeof role === 'string' && KNOWN_ROLES.has(role)
  );
}

/**
 * Check if a user has a specific role.
 *
 * Role storage:
 * - Role.Admin -> existence of `admins/{uid}` (legacy per-role collection,
 *   kept as the source of truth for admin)
 * - All other roles -> membership in the `roles` array on `userRoles/{uid}`
 *
 * @param uid - The user's Firebase Auth UID
 * @param role - The role to check
 * @returns True if the user has the role
 */
export async function hasRole(uid: string, role: Role): Promise<boolean> {
  const db = getDb();

  switch (role) {
    case Role.Admin: {
      const adminDoc = await db.collection('admins').doc(uid).get();
      return adminDoc.exists;
    }
    default: {
      const roles = await getStoredRoles(uid);
      return roles.includes(role);
    }
  }
}

/**
 * Check if a user has ANY of the given roles (any-of semantics).
 *
 * Reads at most two documents regardless of how many roles are checked:
 * `admins/{uid}` (only when Role.Admin is in the set) and `userRoles/{uid}`
 * (only when a non-admin role is in the set), in parallel.
 *
 * @param uid - The user's Firebase Auth UID
 * @param roles - Roles to check; an empty array always returns false
 * @returns True if the user has at least one of the roles
 */
export async function hasAnyRole(
  uid: string,
  roles: readonly Role[]
): Promise<boolean> {
  const nonAdminRoles = roles.filter((role) => role !== Role.Admin);

  const checks: Promise<boolean>[] = [];
  if (roles.includes(Role.Admin)) {
    checks.push(hasRole(uid, Role.Admin));
  }
  if (nonAdminRoles.length > 0) {
    checks.push(
      getStoredRoles(uid).then((stored) =>
        nonAdminRoles.some((role) => stored.includes(role))
      )
    );
  }

  const results = await Promise.all(checks);
  return results.some(Boolean);
}

/**
 * Get every role a user holds: admin (from `admins/{uid}`) plus any
 * roles on `userRoles/{uid}`. Used by the getMyRoles callable so the
 * client can gate navigation.
 *
 * @param uid - The user's Firebase Auth UID
 * @returns The user's roles (may be empty)
 */
export async function getUserRoles(uid: string): Promise<Role[]> {
  const [isAdmin, stored] = await Promise.all([
    hasRole(uid, Role.Admin),
    getStoredRoles(uid),
  ]);
  const roles = new Set<Role>(stored);
  if (isAdmin) roles.add(Role.Admin);
  return [...roles];
}

/**
 * Grant a non-admin role to a user by adding it to the `roles` array
 * on `userRoles/{uid}`.
 *
 * Role.Admin is intentionally rejected — `admins/{uid}` remains the
 * source of truth for admin; use {@link grantAdminRole} instead.
 *
 * @param uid - The user's Firebase Auth UID
 * @param role - The role to grant (must not be Role.Admin)
 * @param grantedBy - UID of the admin granting the role
 */
export async function grantRole(
  uid: string,
  role: Role,
  grantedBy: string
): Promise<void> {
  if (role === Role.Admin) {
    throw new Error('Use grantAdminRole to grant the admin role');
  }
  const db = getDb();
  await db.collection(USER_ROLES_COLLECTION).doc(uid).set(
    {
      roles: FieldValue.arrayUnion(role),
      grantedBy,
      updatedAt: new Date(),
    },
    { merge: true }
  );
}

/**
 * Revoke a non-admin role from a user by removing it from the `roles`
 * array on `userRoles/{uid}`.
 *
 * Role.Admin is intentionally rejected — use {@link revokeAdminRole}.
 *
 * @param uid - The user's Firebase Auth UID
 * @param role - The role to revoke (must not be Role.Admin)
 */
export async function revokeRole(uid: string, role: Role): Promise<void> {
  if (role === Role.Admin) {
    throw new Error('Use revokeAdminRole to revoke the admin role');
  }
  const db = getDb();
  // set + merge (not update) so revoking from a user with no doc is a no-op
  // rather than a NOT_FOUND error
  await db.collection(USER_ROLES_COLLECTION).doc(uid).set(
    {
      roles: FieldValue.arrayRemove(role),
      updatedAt: new Date(),
    },
    { merge: true }
  );
}

/**
 * Add admin role to a user
 *
 * @param uid - The user's Firebase Auth UID
 * @param grantedBy - UID of the admin granting the role
 *
 * @example
 * await grantAdminRole(newAdminUid, currentAdminUid);
 */
export async function grantAdminRole(uid: string, grantedBy: string): Promise<void> {
  const db = getDb();
  await db.collection('admins').doc(uid).set({
    grantedAt: new Date(),
    grantedBy,
  });
}

/**
 * Remove admin role from a user
 *
 * @param uid - The user's Firebase Auth UID
 */
export async function revokeAdminRole(uid: string): Promise<void> {
  const db = getDb();
  await db.collection('admins').doc(uid).delete();
}

/**
 * Get all admin UIDs
 *
 * @returns Array of admin user UIDs
 */
export async function getAdminUids(): Promise<string[]> {
  const db = getDb();
  const snapshot = await db.collection('admins').get();
  return snapshot.docs.map((doc) => doc.id);
}
