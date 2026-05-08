/**
 * Auth API types
 *
 * Request and response types for auth-related Cloud Functions.
 */

/** Request for checkAdminStatus - no data needed, uses auth context */
export type CheckAdminStatusRequest = Record<string, never>;

/** Highest-privilege role the user holds. */
export type UserRole = 'admin' | 'employee' | null;

/**
 * Response from checkAdminStatus.
 *
 * `isAdmin` is the original field and is always present. `isEmployee` and
 * `role` were added later and are optional on the type so a freshly-shipped
 * web app can still parse a response from a not-yet-redeployed function
 * during a rolling deploy. Callers should derive role using all three fields.
 */
export interface CheckAdminStatusResponse {
  isAdmin: boolean;
  isEmployee?: boolean;
  role?: UserRole;
}
