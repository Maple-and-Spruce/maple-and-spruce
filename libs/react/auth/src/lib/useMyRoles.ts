'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type { RequestState, UserRole } from '@maple/ts/domain';
import type {
  GetMyRolesRequest,
  GetMyRolesResponse,
} from '@maple/ts/firebase/api-types';
import { useAuth } from './useAuth';

/**
 * Hook for fetching every role the current user holds (admin + scoped).
 *
 * Calls the getMyRoles Cloud Function after authentication and re-checks
 * when the user changes. Prefer consuming roles via `useRoles()` from
 * RolesProvider — this hook fires its own network request, so mounting it
 * in more than one place duplicates the call.
 */
export function useMyRoles() {
  const { user, isLoading: authLoading } = useAuth();
  const [rolesState, setRolesState] = useState<RequestState<UserRole[]>>({
    status: 'idle',
  });

  const fetchRoles = useCallback(async () => {
    setRolesState({ status: 'loading' });

    try {
      const functions = getMapleFunctions();
      const getMyRoles = httpsCallable<GetMyRolesRequest, GetMyRolesResponse>(
        functions,
        'getMyRoles'
      );

      const result = await getMyRoles({});
      setRolesState({ status: 'success', data: result.data.roles });
    } catch (error) {
      console.error('Failed to fetch roles:', error);
      setRolesState({
        status: 'error',
        error:
          error instanceof Error ? error.message : 'Failed to fetch roles',
      });
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (user) {
      fetchRoles();
    } else {
      setRolesState({ status: 'idle' });
    }
  }, [user, authLoading, fetchRoles]);

  const roles = rolesState.status === 'success' ? rolesState.data : [];

  return {
    rolesState,
    roles,
    isAdmin: roles.includes('admin'),
    hasAnyRole: roles.length > 0,
    isCheckingRoles: rolesState.status === 'loading' || authLoading,
  };
}
