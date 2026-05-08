'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type { RequestState } from '@maple/ts/domain';
import type {
  CheckAdminStatusRequest,
  CheckAdminStatusResponse,
  UserRole,
} from '@maple/ts/firebase/api-types';
import { useAuth } from './useAuth';

/**
 * Hook for fetching the signed-in user's highest role.
 *
 * Calls `checkAdminStatus` (which now returns role information for
 * admin and employee). Used by EmployeeGuard and the admin nav to
 * decide what Nathan vs Katie sees.
 */
export function useUserRole() {
  const { user, isLoading: authLoading } = useAuth();
  const [roleState, setRoleState] = useState<RequestState<UserRole>>({
    status: 'idle',
  });

  const checkRole = useCallback(async () => {
    setRoleState({ status: 'loading' });
    try {
      const fn = httpsCallable<
        CheckAdminStatusRequest,
        CheckAdminStatusResponse
      >(getMapleFunctions(), 'checkAdminStatus');
      const result = await fn({});
      // Tolerate the legacy response shape `{ isAdmin: true }` so the admin
      // app keeps working during a deploy when the web app ships before the
      // updated checkAdminStatus function. Once `role` is present, trust it.
      const data = result.data;
      const role: UserRole =
        data.role !== undefined
          ? data.role
          : data.isAdmin
            ? 'admin'
            : data.isEmployee
              ? 'employee'
              : null;
      setRoleState({ status: 'success', data: role });
    } catch (error) {
      console.error('Failed to check user role:', error);
      setRoleState({
        status: 'error',
        error:
          error instanceof Error ? error.message : 'Failed to check user role',
      });
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (user) {
      checkRole();
    } else {
      setRoleState({ status: 'idle' });
    }
  }, [user, authLoading, checkRole]);

  const role: UserRole =
    roleState.status === 'success' ? roleState.data : null;

  return {
    roleState,
    role,
    isAdmin: role === 'admin',
    isEmployee: role === 'employee',
    isCheckingRole: roleState.status === 'loading' || authLoading,
  };
}
