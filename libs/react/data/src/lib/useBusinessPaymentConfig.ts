'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallableFromURL } from 'firebase/functions';
import {
  getMapleFunctions,
  routerCallableUrl,
} from '@maple/ts/firebase/firebase-config';
import type { BusinessPaymentConfig, RequestState } from '@maple/ts/domain';
import type {
  GetBusinessPaymentConfigRequest,
  GetBusinessPaymentConfigResponse,
  UpdateBusinessPaymentConfigRequest,
  UpdateBusinessPaymentConfigResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Hook for the business Venmo handle config (legacy #631), shown on the admin
 * Settings page. Used to render the pay-by-Venmo QR on the teacher My Day page.
 * Served by the `settings` router (#156).
 */
export function useBusinessPaymentConfig() {
  const [configState, setConfigState] = useState<
    RequestState<BusinessPaymentConfig>
  >({ status: 'idle' });

  const fetchConfig = useCallback(async () => {
    setConfigState({ status: 'loading' });
    try {
      const fn = httpsCallableFromURL<
        GetBusinessPaymentConfigRequest,
        GetBusinessPaymentConfigResponse
      >(
        getMapleFunctions(),
        routerCallableUrl('settings', 'getBusinessPaymentConfig')
      );
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
      const fn = httpsCallableFromURL<
        UpdateBusinessPaymentConfigRequest,
        UpdateBusinessPaymentConfigResponse
      >(
        getMapleFunctions(),
        routerCallableUrl('settings', 'updateBusinessPaymentConfig')
      );
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
