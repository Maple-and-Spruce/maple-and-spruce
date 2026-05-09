/**
 * Auth API types
 *
 * Request and response types for auth-related Cloud Functions.
 */

/** Request for checkAdminStatus - no data needed, uses auth context */
export type CheckAdminStatusRequest = Record<string, never>;

/** Highest-privilege role the user holds. */
export type UserRole = 'admin' | 'employee' | null;

/** Response from checkAdminStatus */
export interface CheckAdminStatusResponse {
  /** Kept for backwards compatibility — equivalent to `role === 'admin'` */
  isAdmin: boolean;
  isEmployee: boolean;
  role: UserRole;
}
