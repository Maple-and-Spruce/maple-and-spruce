/**
 * Check Admin Status Cloud Function
 *
 * Returns whether the authenticated user is an admin. Requires
 * authentication but NOT admin role (any logged-in user can check).
 */
import {
  createAuthenticatedFunction,
  hasRole,
  Role,
  type FunctionContext,
} from '@maple/firebase/functions';
import type {
  CheckAdminStatusRequest,
  CheckAdminStatusResponse,
} from '@maple/ts/firebase/api-types';

export const checkAdminStatus = createAuthenticatedFunction<
  CheckAdminStatusRequest,
  CheckAdminStatusResponse
>(async (_data, context: FunctionContext) => {
  if (!context.uid) {
    return { isAdmin: false };
  }

  const isAdmin = await hasRole(context.uid, Role.Admin);
  return { isAdmin };
});
