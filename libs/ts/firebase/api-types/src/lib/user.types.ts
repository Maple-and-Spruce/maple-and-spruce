/**
 * User & role administration API types
 */
import type { AppUser } from '@maple/ts/domain';

// ============================================================================
// List Users (admin)
// ============================================================================

export interface GetUsersRequest {
  /** Max users to return. Defaults to 200; capped at 1000 (Firebase Auth limit per page). */
  limit?: number;
}

export interface GetUsersResponse {
  users: AppUser[];
  /** Hint to the UI that more users exist beyond the returned page. */
  hasMore: boolean;
}

// ============================================================================
// Grant / Revoke Admin Role
// ============================================================================

export interface GrantAdminRoleRequest {
  uid: string;
}

export interface GrantAdminRoleResponse {
  success: boolean;
}

export interface RevokeAdminRoleRequest {
  uid: string;
}

export interface RevokeAdminRoleResponse {
  success: boolean;
}
