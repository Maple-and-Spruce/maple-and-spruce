/**
 * Grant Admin Role Cloud Function
 *
 * Admin-only. Promotes another user to admin by writing `admins/{uid}`.
 * Records the granting admin's UID for audit purposes.
 */
import {
  createAdminFunction,
  grantAdminRole as grantAdminRoleUtil,
  throwInvalidArgument,
} from '@maple/firebase/functions';
import type {
  GrantAdminRoleRequest,
  GrantAdminRoleResponse,
} from '@maple/ts/firebase/api-types';

export const grantAdminRole = createAdminFunction<
  GrantAdminRoleRequest,
  GrantAdminRoleResponse
>(async (data, context) => {
  if (!context.uid) throwInvalidArgument('Authentication required');
  if (!data.uid) throwInvalidArgument('Target user UID is required');

  await grantAdminRoleUtil(data.uid, context.uid);
  return { success: true };
});
