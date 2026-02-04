'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  Registration,
  UpdateRegistrationInput,
  RegistrationStatus,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetRegistrationsRequest,
  GetRegistrationsResponse,
  UpdateRegistrationRequest,
  UpdateRegistrationResponse,
  CancelRegistrationRequest,
  CancelRegistrationResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Filters for fetching registrations
 */
export interface UseRegistrationsFilters {
  classId?: string;
  status?: RegistrationStatus;
  customerEmail?: string;
}

/**
 * Hook for managing registration operations (admin)
 */
export function useRegistrations(filters?: UseRegistrationsFilters) {
  const [registrationsState, setRegistrationsState] = useState<
    RequestState<Registration[]>
  >({
    status: 'idle',
  });

  const fetchRegistrations = useCallback(async () => {
    setRegistrationsState({ status: 'loading' });

    try {
      const functions = getMapleFunctions();
      const getRegistrations = httpsCallable<
        GetRegistrationsRequest,
        GetRegistrationsResponse
      >(functions, 'getRegistrations');

      const result = await getRegistrations({
        classId: filters?.classId,
        status: filters?.status,
        customerEmail: filters?.customerEmail,
      });
      setRegistrationsState({
        status: 'success',
        data: result.data.registrations,
      });
    } catch (error) {
      console.error('Failed to fetch registrations:', error);
      setRegistrationsState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch registrations',
      });
    }
  }, [filters?.classId, filters?.status, filters?.customerEmail]);

  const updateRegistration = useCallback(
    async (input: UpdateRegistrationInput): Promise<Registration> => {
      const functions = getMapleFunctions();
      const update = httpsCallable<
        UpdateRegistrationRequest,
        UpdateRegistrationResponse
      >(functions, 'updateRegistration');

      const result = await update(input);

      setRegistrationsState((prev) => {
        if (prev.status !== 'success') return prev;
        return {
          ...prev,
          data: prev.data.map((r) =>
            r.id === result.data.registration.id
              ? result.data.registration
              : r
          ),
        };
      });

      return result.data.registration;
    },
    []
  );

  const cancelRegistration = useCallback(
    async (
      id: string,
      refund: boolean
    ): Promise<{ registration: Registration; refundId?: string }> => {
      const functions = getMapleFunctions();
      const cancel = httpsCallable<
        CancelRegistrationRequest,
        CancelRegistrationResponse
      >(functions, 'cancelRegistration');

      const result = await cancel({ id, refund });

      setRegistrationsState((prev) => {
        if (prev.status !== 'success') return prev;
        return {
          ...prev,
          data: prev.data.map((r) =>
            r.id === result.data.registration.id
              ? result.data.registration
              : r
          ),
        };
      });

      return {
        registration: result.data.registration,
        refundId: result.data.refundId,
      };
    },
    []
  );

  useEffect(() => {
    fetchRegistrations();
  }, [fetchRegistrations]);

  return {
    registrationsState,
    fetchRegistrations,
    updateRegistration,
    cancelRegistration,
  };
}
