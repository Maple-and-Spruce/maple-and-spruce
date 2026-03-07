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
