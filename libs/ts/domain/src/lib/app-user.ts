/**
 * AppUser
 *
 * The shape returned by `listUsers` for the admin /users page — a Firebase
 * Auth user joined with the role records that gate access to the admin app.
 *
 * Email may be null because Firebase Auth allows phone-only and anonymous
 * accounts; in practice every account in this project signs up with email,
 * but we keep the type honest.
 */

/**
 * Roles a portal user can hold. Wire values match the server-side `Role`
 * enum in `@maple/firebase/functions` (which client code cannot import).
 */
export type UserRole = 'admin' | 'mt-teacher' | 'clerk' | 'lesson-teacher';

/** Scoped (non-admin) roles, in display order. */
export const SCOPED_USER_ROLES = [
  'mt-teacher',
  'clerk',
  'lesson-teacher',
] as const satisfies readonly UserRole[];

export type ScopedUserRole = (typeof SCOPED_USER_ROLES)[number];

/** Human-readable labels for each role. */
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  'mt-teacher': 'MT Teacher',
  clerk: 'Clerk',
  'lesson-teacher': 'Lesson Teacher',
};

export interface AppUser {
  uid: string;
  email: string | null;
  displayName?: string;
  photoUrl?: string;
  emailVerified: boolean;
  disabled: boolean;
  createdAt: Date;
  lastSignInAt?: Date;
  /** True if the user has an `admins/{uid}` record. */
  isAdmin: boolean;
  /** Scoped roles from `userRoles/{uid}` (never includes 'admin'). */
  roles: ScopedUserRole[];
}
