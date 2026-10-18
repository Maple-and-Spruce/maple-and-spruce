'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallableFromURL } from 'firebase/functions';
import {
  getMapleFunctions,
  routerCallableUrl,
} from '@maple/ts/firebase/firebase-config';
import type {
  LessonRateByLength,
  LessonRatesConfig,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetLessonRatesConfigRequest,
  GetLessonRatesConfigResponse,
  UpdateLessonRatesConfigRequest,
  UpdateLessonRatesConfigResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Hook for the admin-configured default private-pay lesson rates (legacy #629), shown
 * on the Settings page. Per-student overrides live on the student record.
 * Served by the `settings` router (#156).
 */
export function useLessonRatesConfig() {
  const [configState, setConfigState] = useState<
    RequestState<LessonRatesConfig>
  >({ status: 'idle' });

  const fetchConfig = useCallback(async () => {
    setConfigState({ status: 'loading' });
    try {
      const fn = httpsCallableFromURL<
        GetLessonRatesConfigRequest,
        GetLessonRatesConfigResponse
      >(
        getMapleFunctions(),
        routerCallableUrl('settings', 'getLessonRatesConfig')
      );
      const result = await fn({});
      setConfigState({ status: 'success', data: result.data.config });
    } catch (error) {
      console.error('Failed to fetch lesson rates config:', error);
      setConfigState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to fetch config',
      });
    }
  }, []);

  const saveConfig = useCallback(
    async (rateByLength: LessonRateByLength): Promise<LessonRatesConfig> => {
      const fn = httpsCallableFromURL<
        UpdateLessonRatesConfigRequest,
        UpdateLessonRatesConfigResponse
      >(
        getMapleFunctions(),
        routerCallableUrl('settings', 'updateLessonRatesConfig')
      );
      const result = await fn({ rateByLength });
      setConfigState({ status: 'success', data: result.data.config });
      return result.data.config;
    },
    []
  );

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return { configState, fetchConfig, saveConfig };
}
