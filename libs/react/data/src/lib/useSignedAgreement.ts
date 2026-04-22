'use client';

import { useState, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type { SignedAgreement, RequestState } from '@maple/ts/domain';
import type {
  GetSignedAgreementRequest,
  GetSignedAgreementResponse,
} from '@maple/ts/firebase/api-types';

export interface SignedAgreementDetail {
  agreement: SignedAgreement;
  signatureImageUrl: string;
  guardianSignatureImageUrl?: string;
}

export function useSignedAgreement() {
  const [detailState, setDetailState] = useState<
    RequestState<SignedAgreementDetail>
  >({ status: 'idle' });

  const fetchSignedAgreement = useCallback(async (id: string) => {
    setDetailState({ status: 'loading' });
    try {
      const functions = getMapleFunctions();
      const getAgreement = httpsCallable<
        GetSignedAgreementRequest,
        GetSignedAgreementResponse
      >(functions, 'getSignedAgreement');
      const result = await getAgreement({ id });
      setDetailState({ status: 'success', data: result.data });
    } catch (error) {
      console.error('Failed to fetch signed agreement:', error);
      setDetailState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch signed agreement',
      });
    }
  }, []);

  const clearDetail = useCallback(() => {
    setDetailState({ status: 'idle' });
  }, []);

  return {
    detailState,
    fetchSignedAgreement,
    clearDetail,
  };
}
