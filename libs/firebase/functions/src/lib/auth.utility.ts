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

/**
 * Roles available in the system
 */
export enum Role {
  /** Full administrative access */
  Admin = 'admin',
}

/**
 * Check if a user has a specific role
 *
 * Roles are stored in the 'admins' collection where the document ID
 * matches the user's UID.
 *
 * @param uid - The user's Firebase Auth UID
 * @param role - The role to check
 * @returns True if the user has the role
 *
 * @example
 * const isAdmin = await hasRole(uid, Role.Admin);
 * if (!isAdmin) {
 *   throw new HttpsError('permission-denied', 'Admin access required');
 * }
 */
export async function hasRole(uid: string, role: Role): Promise<boolean> {
  const db = getDb();

  switch (role) {
    case Role.Admin: {
      const adminDoc = await db.collection('admins').doc(uid).get();
      return adminDoc.exists;
    }
    default:
      return false;
  }
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
