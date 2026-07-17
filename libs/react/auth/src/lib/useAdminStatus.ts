'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type { RequestState } from '@maple/ts/domain';
import type {
  CheckAdminStatusRequest,
  CheckAdminStatusResponse,
} from '@maple/ts/firebase/api-types';
import { useAuth } from './useAuth';

/**
 * Hook for checking if the current user has admin access.
 *
 * Calls the checkAdminStatus Cloud Function after authentication.
 * Re-checks when the user changes.
 *
 * @deprecated Use useRoles() (from RolesProvider) / useMyRoles() —
 * roles include admin plus the scoped roles (mt-teacher, clerk,
 * lesson-teacher).
 */
export function useAdminStatus() {
  const { user, isLoading: authLoading } = useAuth();
  const [adminState, setAdminState] = useState<RequestState<boolean>>({
    status: 'idle',
  });

  const checkStatus = useCallback(async () => {
    setAdminState({ status: 'loading' });

    try {
      const functions = getMapleFunctions();
      const checkAdminStatus = httpsCallable<
        CheckAdminStatusRequest,
        CheckAdminStatusResponse
      >(functions, 'checkAdminStatus');

      const result = await checkAdminStatus({});
      setAdminState({
        status: 'success',
        data: result.data.isAdmin,
      });
    } catch (error) {
      console.error('Failed to check admin status:', error);
      setAdminState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to check admin status',
      });
    }
  }, []);

  // Check admin status when user is available
  useEffect(() => {
    if (authLoading) return;

    if (user) {
      checkStatus();
    } else {
      setAdminState({ status: 'idle' });
    }
  }, [user, authLoading, checkStatus]);

  return {
    adminState,
    isAdmin: adminState.status === 'success' && adminState.data === true,
    isCheckingAdmin: adminState.status === 'loading' || authLoading,
  };
}
