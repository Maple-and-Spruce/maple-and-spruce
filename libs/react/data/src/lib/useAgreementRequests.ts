'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  AgreementRequest,
  AgreementRequestStatus,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetAgreementRequestsRequest,
  GetAgreementRequestsResponse,
  SendAgreementRequestRequest,
  SendAgreementRequestResponse,
  ResendAgreementRequestRequest,
  ResendAgreementRequestResponse,
} from '@maple/ts/firebase/api-types';
import type { AgreementDeliveryMethod } from '@maple/ts/domain';

export interface UseAgreementRequestsFilters {
  status?: AgreementRequestStatus;
  signerEmail?: string;
}

export function useAgreementRequests(
  filters?: UseAgreementRequestsFilters
) {
  const [requestsState, setRequestsState] = useState<
    RequestState<AgreementRequest[]>
  >({ status: 'idle' });

  const fetchRequests = useCallback(async () => {
    setRequestsState({ status: 'loading' });
    try {
      const functions = getMapleFunctions();
      const getRequests = httpsCallable<
        GetAgreementRequestsRequest,
        GetAgreementRequestsResponse
      >(functions, 'getAgreementRequests');
      const result = await getRequests({
        status: filters?.status,
        signerEmail: filters?.signerEmail,
      });
      setRequestsState({ status: 'success', data: result.data.requests });
    } catch (error) {
      console.error('Failed to fetch agreement requests:', error);
      setRequestsState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch requests',
      });
    }
  }, [filters?.status, filters?.signerEmail]);

  const sendRequest = useCallback(
    async (input: {
      templateId: string;
      signerEmail: string;
      signerName: string;
      signerPhone?: string;
      deliveryMethod: AgreementDeliveryMethod;
      classId?: string;
      studentId?: string;
    }): Promise<AgreementRequest> => {
      const functions = getMapleFunctions();
      const send = httpsCallable<
        SendAgreementRequestRequest,
        SendAgreementRequestResponse
      >(functions, 'sendAgreementRequest');
      const result = await send(input);
      setRequestsState((prev) => {
        if (prev.status !== 'success') return prev;
        return { ...prev, data: [result.data.request, ...prev.data] };
      });
      return result.data.request;
    },
    []
  );

  const resendRequest = useCallback(
    async (id: string): Promise<void> => {
      const functions = getMapleFunctions();
      const resend = httpsCallable<
        ResendAgreementRequestRequest,
        ResendAgreementRequestResponse
      >(functions, 'resendAgreementRequest');
      const result = await resend({ id });
      setRequestsState((prev) => {
        if (prev.status !== 'success') return prev;
        return {
          ...prev,
          data: prev.data.map((r) =>
            r.id === id ? result.data.request : r
          ),
        };
      });
    },
    []
  );

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  return {
    requestsState,
    fetchRequests,
    sendRequest,
    resendRequest,
  };
}
