/**
 * Auth API types
 *
 * Request and response types for auth-related Cloud Functions.
 */

/** Request for checkAdminStatus - no data needed, uses auth context */
export type CheckAdminStatusRequest = Record<string, never>;

/** Response from checkAdminStatus */
export interface CheckAdminStatusResponse {
  isAdmin: boolean;
}

/**
 * Roles a portal user can hold. Mirrors the server-side `Role` enum in
 * `@maple/firebase/functions` (which client code cannot import).
 */
export type UserRole = 'admin' | 'mt-teacher' | 'clerk' | 'lesson-teacher';

/** Request for getMyRoles - no data needed, uses auth context */
export type GetMyRolesRequest = Record<string, never>;

/** Response from getMyRoles */
export interface GetMyRolesResponse {
  roles: UserRole[];
}
