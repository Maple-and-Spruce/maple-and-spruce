'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type { RequestState } from '@maple/ts/domain';
import type {
  EtsyAuthUrlRequest,
  EtsyAuthUrlResponse,
  EtsyAuthCallbackRequest,
  EtsyAuthCallbackResponse,
  GetEtsyConnectionStatusRequest,
  GetEtsyConnectionStatusResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Hook for managing the Etsy OAuth connection.
 *
 * Provides connection status, auth URL generation, and callback handling.
 */
export function useEtsyConnection() {
  const [connectionState, setConnectionState] = useState<
    RequestState<GetEtsyConnectionStatusResponse>
  >({ status: 'idle' });

  const [authUrlState, setAuthUrlState] = useState<
    RequestState<EtsyAuthUrlResponse>
  >({ status: 'idle' });

  const [callbackState, setCallbackState] = useState<
    RequestState<EtsyAuthCallbackResponse>
  >({ status: 'idle' });

  const fetchConnectionStatus = useCallback(async () => {
    setConnectionState({ status: 'loading' });
    try {
      const functions = getMapleFunctions();
      const getStatus = httpsCallable<
        GetEtsyConnectionStatusRequest,
        GetEtsyConnectionStatusResponse
      >(functions, 'getEtsyConnectionStatus');

      const result = await getStatus({});
      setConnectionState({ status: 'success', data: result.data });
    } catch (error) {
      console.error('Failed to fetch Etsy connection status:', error);
      setConnectionState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch Etsy connection status',
      });
    }
  }, []);

  const generateAuthUrl = useCallback(async () => {
    setAuthUrlState({ status: 'loading' });
    try {
      const functions = getMapleFunctions();
      const getAuthUrl = httpsCallable<
        EtsyAuthUrlRequest,
        EtsyAuthUrlResponse
      >(functions, 'etsyAuthUrl');

      const result = await getAuthUrl({});
      setAuthUrlState({ status: 'success', data: result.data });
      return result.data;
    } catch (error) {
      console.error('Failed to generate Etsy auth URL:', error);
      setAuthUrlState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate auth URL',
      });
      return null;
    }
  }, []);

  const handleCallback = useCallback(
    async (code: string, state: string) => {
      setCallbackState({ status: 'loading' });
      try {
        const functions = getMapleFunctions();
        const authCallback = httpsCallable<
          EtsyAuthCallbackRequest,
          EtsyAuthCallbackResponse
        >(functions, 'etsyAuthCallback');

        const result = await authCallback({ code, state });
        setCallbackState({ status: 'success', data: result.data });

        // Refresh connection status after successful auth
        await fetchConnectionStatus();

        return result.data;
      } catch (error) {
        console.error('Etsy auth callback failed:', error);
        setCallbackState({
          status: 'error',
          error:
            error instanceof Error
              ? error.message
              : 'Failed to complete Etsy authorization',
        });
        return null;
      }
    },
    [fetchConnectionStatus]
  );

  useEffect(() => {
    fetchConnectionStatus();
  }, [fetchConnectionStatus]);

  return {
    connectionState,
    authUrlState,
    callbackState,
    fetchConnectionStatus,
    generateAuthUrl,
    handleCallback,
  };
}
