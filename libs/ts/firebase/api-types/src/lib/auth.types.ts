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
 * Roles a portal user can hold. Canonical definition lives in
 * `@maple/ts/domain` (app-user.ts); re-exported here so API consumers can
 * import request/response types and the role union from one place.
 */
export type { UserRole } from '@maple/ts/domain';
import type { UserRole } from '@maple/ts/domain';

/** Request for getMyRoles - no data needed, uses auth context */
export type GetMyRolesRequest = Record<string, never>;

/** Response from getMyRoles */
export interface GetMyRolesResponse {
  roles: UserRole[];
}
