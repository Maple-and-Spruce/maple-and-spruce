'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  AppUser,
  RequestState,
  ScopedUserRole,
} from '@maple/ts/domain';
import type {
  GetUsersRequest,
  GetUsersResponse,
  GrantAdminRoleRequest,
  GrantAdminRoleResponse,
  RevokeAdminRoleRequest,
  RevokeAdminRoleResponse,
  GrantRoleRequest,
  GrantRoleResponse,
  RevokeRoleRequest,
  RevokeRoleResponse,
} from '@maple/ts/firebase/api-types';

/**
 * httpsCallable serializes the response to JSON, so server-side `Date`
 * fields arrive as ISO strings even though the typed surface still says
 * `Date`. Hydrate them at the boundary so consumers can call `.getTime()`,
 * `toLocaleDateString()`, etc. without the type lying.
 */
function toDate(value: unknown): Date | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  return undefined;
}

function hydrateUser(raw: AppUser): AppUser {
  return {
    ...raw,
    createdAt: toDate(raw.createdAt) ?? new Date(0),
    lastSignInAt: toDate(raw.lastSignInAt),
  };
}

/**
 * Hook for the admin /users page.
 *
 * Returns the list of all Firebase Auth users with their admin status,
 * plus actions for granting and revoking admin.
 */
export function useUsers() {
  const [usersState, setUsersState] = useState<RequestState<AppUser[]>>({
    status: 'idle',
  });
  const [hasMore, setHasMore] = useState(false);

  const fetchUsers = useCallback(async () => {
    setUsersState({ status: 'loading' });
    try {
      const fn = httpsCallable<GetUsersRequest, GetUsersResponse>(
        getMapleFunctions(),
        'listUsers'
      );
      const result = await fn({});
      setUsersState({
        status: 'success',
        data: result.data.users.map(hydrateUser),
      });
      setHasMore(result.data.hasMore);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      setUsersState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to fetch users',
      });
    }
  }, []);

  const grantAdmin = useCallback(async (uid: string): Promise<void> => {
    const fn = httpsCallable<GrantAdminRoleRequest, GrantAdminRoleResponse>(
      getMapleFunctions(),
      'grantAdminRole'
    );
    await fn({ uid });
    setUsersState((prev) =>
      prev.status === 'success'
        ? {
            ...prev,
            data: prev.data.map((u) =>
              u.uid === uid ? { ...u, isAdmin: true } : u
            ),
          }
        : prev
    );
  }, []);

  const revokeAdmin = useCallback(async (uid: string): Promise<void> => {
    const fn = httpsCallable<
      RevokeAdminRoleRequest,
      RevokeAdminRoleResponse
    >(getMapleFunctions(), 'revokeAdminRole');
    await fn({ uid });
    setUsersState((prev) =>
      prev.status === 'success'
        ? {
            ...prev,
            data: prev.data.map((u) =>
              u.uid === uid ? { ...u, isAdmin: false } : u
            ),
          }
        : prev
    );
  }, []);

  const grantRole = useCallback(
    async (uid: string, role: ScopedUserRole): Promise<void> => {
      const fn = httpsCallable<GrantRoleRequest, GrantRoleResponse>(
        getMapleFunctions(),
        'grantRole'
      );
      await fn({ uid, role });
      setUsersState((prev) =>
        prev.status === 'success'
          ? {
              ...prev,
              data: prev.data.map((u) =>
                u.uid === uid && !u.roles.includes(role)
                  ? { ...u, roles: [...u.roles, role] }
                  : u
              ),
            }
          : prev
      );
    },
    []
  );

  const revokeRole = useCallback(
    async (uid: string, role: ScopedUserRole): Promise<void> => {
      const fn = httpsCallable<RevokeRoleRequest, RevokeRoleResponse>(
        getMapleFunctions(),
        'revokeRole'
      );
      await fn({ uid, role });
      setUsersState((prev) =>
        prev.status === 'success'
          ? {
              ...prev,
              data: prev.data.map((u) =>
                u.uid === uid
                  ? { ...u, roles: u.roles.filter((r) => r !== role) }
                  : u
              ),
            }
          : prev
      );
    },
    []
  );

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return {
    usersState,
    hasMore,
    fetchUsers,
    grantAdmin,
    revokeAdmin,
    grantRole,
    revokeRole,
  };
}
