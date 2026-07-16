/**
 * Get My Roles Cloud Function
 *
 * Returns every role the authenticated user holds (admin from
 * `admins/{uid}`, scoped roles from `userRoles/{uid}`). Requires
 * authentication but NO role — any logged-in user can ask about
 * themselves. The client uses this to gate navigation; enforcement
 * stays server-side in each function's role check.
 */
import { Functions, getUserRoles } from '@maple/firebase/functions';
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

    const roles = await getUserRoles(context.uid);
    return { roles: roles as UserRole[] };
  });
