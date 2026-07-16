/**
 * Revoke Role Cloud Function
 *
 * Admin-only. Revokes a scoped role (mt-teacher, clerk, lesson-teacher)
 * from a user by removing it from the `roles` array on `userRoles/{uid}`.
 *
 * The admin role itself is intentionally NOT revocable here —
 * `admins/{uid}` stays the source of truth for admin; use revokeAdminRole.
 */
import {
  Functions,
  Role,
  revokeRole as revokeRoleUtil,
  throwInvalidArgument,
} from '@maple/firebase/functions';
import type {
  RevokeRoleRequest,
  RevokeRoleResponse,
} from '@maple/ts/firebase/api-types';

/** Roles this function may revoke (everything except admin) */
const REVOCABLE_ROLES = new Set<string>(
  Object.values(Role).filter((role) => role !== Role.Admin)
);

export const revokeRole = Functions.endpoint
  .requiringRole(Role.Admin)
  .handle<RevokeRoleRequest, RevokeRoleResponse>(async (data, _context) => {
    if (!data.uid) throwInvalidArgument('Target user UID is required');
    if (!data.role || !REVOCABLE_ROLES.has(data.role)) {
      throwInvalidArgument(
        `Role must be one of: ${[...REVOCABLE_ROLES].join(', ')}`
      );
    }

    await revokeRoleUtil(data.uid, data.role as Role);
    return { success: true };
  });
