/**
 * Revoke Admin Role Cloud Function
 *
 * Admin-only. Removes admin access from another user. Self-protection:
 * an admin cannot revoke their own admin role — that's the kind of
 * mistake that would brick the admin app for the person making it,
 * since they'd lose access to /users on the next page load.
 */
import {
  createAdminFunction,
  revokeAdminRole as revokeAdminRoleUtil,
  throwInvalidArgument,
  throwFailedPrecondition,
} from '@maple/firebase/functions';
import type {
  RevokeAdminRoleRequest,
  RevokeAdminRoleResponse,
} from '@maple/ts/firebase/api-types';

export const revokeAdminRole = createAdminFunction<
  RevokeAdminRoleRequest,
  RevokeAdminRoleResponse
>(async (data, context) => {
  if (!context.uid) throwInvalidArgument('Authentication required');
  if (!data.uid) throwInvalidArgument('Target user UID is required');

  if (data.uid === context.uid) {
    throwFailedPrecondition('You cannot revoke your own admin role');
  }

  await revokeAdminRoleUtil(data.uid);
  return { success: true };
});
