/**
 * Get My Roles Cloud Function
 *
 * Returns every role the authenticated user holds (admin from
 * `admins/{uid}`, scoped roles from `userRoles/{uid}`). Requires
 * authentication but NO role — any logged-in user can ask about
 * themselves. The client uses this to gate navigation; enforcement
 * stays server-side in each function's role check.
 *
 * Also returns the instructor the login is linked to (#157), so a teacher's
 * pages can default to their own students. It is a convenience for what to
 * show first, never a permission: scoping is still enforced per function.
 */
import {
  Functions,
  getUserRoles,
  instructorIdForUser,
} from '@maple/firebase/functions';
import type {
  GetMyRolesRequest,
  GetMyRolesResponse,
  UserRole,
} from '@maple/ts/firebase/api-types';

export const getMyRoles = Functions.endpoint
  .requiringAuth()
  .handle<GetMyRolesRequest, GetMyRolesResponse>(async (_data, context) => {
    if (!context.uid) {
      return { roles: [] };
    }

    const [roles, instructorId] = await Promise.all([
      getUserRoles(context.uid),
      instructorIdForUser(context.uid),
    ]);
    return instructorId
      ? { roles: roles as UserRole[], instructorId }
      : { roles: roles as UserRole[] };
  });
