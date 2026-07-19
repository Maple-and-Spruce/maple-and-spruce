'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type { BusinessPaymentConfig, RequestState } from '@maple/ts/domain';
import type {
  GetBusinessPaymentConfigRequest,
  GetBusinessPaymentConfigResponse,
  UpdateBusinessPaymentConfigRequest,
  UpdateBusinessPaymentConfigResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Hook for the business Venmo handle config (#631), shown on the admin
 * Settings page. Used to render the pay-by-Venmo QR on the teacher My Day page.
 */
export function useBusinessPaymentConfig() {
  const [configState, setConfigState] = useState<
    RequestState<BusinessPaymentConfig>
  >({ status: 'idle' });

  const fetchConfig = useCallback(async () => {
    setConfigState({ status: 'loading' });
    try {
      const fn = httpsCallable<
        GetBusinessPaymentConfigRequest,
        GetBusinessPaymentConfigResponse
      >(getMapleFunctions(), 'getBusinessPaymentConfig');
      const result = await fn({});
      setConfigState({ status: 'success', data: result.data.config });
    } catch (error) {
      console.error('Failed to fetch business payment config:', error);
      setConfigState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to fetch config',
      });
    }
  }, []);

  const saveVenmoHandle = useCallback(
    async (venmoHandle: string): Promise<BusinessPaymentConfig> => {
      const fn = httpsCallable<
        UpdateBusinessPaymentConfigRequest,
        UpdateBusinessPaymentConfigResponse
      >(getMapleFunctions(), 'updateBusinessPaymentConfig');
      const result = await fn({ venmoHandle });
      setConfigState({ status: 'success', data: result.data.config });
      return result.data.config;
    },
    []
  );

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return { configState, fetchConfig, saveVenmoHandle };
}
