/**
 * Check Admin Status Cloud Function
 *
 * Returns the user's role(s). Originally just `isAdmin` — extended to also
 * report `isEmployee` and the highest-privilege `role` so the admin app can
 * route Nathan (employee) to a narrower view than Katie (admin).
 *
 * Requires authentication but NOT admin role (any logged-in user can check).
 */
import {
  createAuthenticatedFunction,
  getCurrentRole,
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
    return { isAdmin: false, isEmployee: false, role: null };
  }

  const role = await getCurrentRole(context.uid);
  return {
    isAdmin: role === Role.Admin,
    isEmployee: role === Role.Employee,
    role: role === null ? null : role === Role.Admin ? 'admin' : 'employee',
  };
});
