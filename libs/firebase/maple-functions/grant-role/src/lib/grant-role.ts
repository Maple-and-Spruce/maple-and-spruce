/**
 * Grant Role Cloud Function
 *
 * Admin-only. Grants a scoped role (mt-teacher, clerk, lesson-teacher)
 * to another user by adding it to the `roles` array on `userRoles/{uid}`.
 * Records the granting admin's UID for audit purposes.
 *
 * The admin role itself is intentionally NOT grantable here —
 * `admins/{uid}` stays the source of truth for admin; use grantAdminRole.
 */
import {
  Functions,
  Role,
  grantRole as grantRoleUtil,
  throwInvalidArgument,
} from '@maple/firebase/functions';
import type {
  GrantRoleRequest,
  GrantRoleResponse,
} from '@maple/ts/firebase/api-types';

/** Roles this function may grant (everything except admin) */
const GRANTABLE_ROLES = new Set<string>(
  Object.values(Role).filter((role) => role !== Role.Admin)
);

export const grantRole = Functions.endpoint
  .requiringRole(Role.Admin)
  .handle<GrantRoleRequest, GrantRoleResponse>(async (data, context) => {
    if (!context.uid) throwInvalidArgument('Authentication required');
    if (!data.uid) throwInvalidArgument('Target user UID is required');
    if (!data.role || !GRANTABLE_ROLES.has(data.role)) {
      throwInvalidArgument(
        `Role must be one of: ${[...GRANTABLE_ROLES].join(', ')}`
      );
    }

    await grantRoleUtil(data.uid, data.role as Role, context.uid);
    return { success: true };
  });
