'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallableFromURL } from 'firebase/functions';
import {
  getMapleFunctions,
  routerCallableUrl,
} from '@maple/ts/firebase/firebase-config';
import type { PosLessonConfig, RequestState } from '@maple/ts/domain';
import type {
  GetPosLessonConfigRequest,
  GetPosLessonConfigResponse,
  UpdatePosLessonConfigRequest,
  UpdatePosLessonConfigResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Hook for the "POS lesson catalog items" config manager (legacy #628): which Square
 * catalog object ids count as lessons when rung up at the POS. Served by the
 * `settings` router (#156).
 */
export function usePosLessonConfig() {
  const [configState, setConfigState] = useState<RequestState<PosLessonConfig>>({
    status: 'idle',
  });

  const fetchConfig = useCallback(async () => {
    setConfigState({ status: 'loading' });
    try {
      const fn = httpsCallableFromURL<
        GetPosLessonConfigRequest,
        GetPosLessonConfigResponse
      >(
        getMapleFunctions(),
        routerCallableUrl('settings', 'getPosLessonConfig')
      );
      const result = await fn({});
      setConfigState({ status: 'success', data: result.data.config });
    } catch (error) {
      console.error('Failed to fetch POS lesson config:', error);
      setConfigState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to fetch config',
      });
    }
  }, []);

  const saveConfig = useCallback(
    async (lessonCatalogObjectIds: string[]): Promise<PosLessonConfig> => {
      const fn = httpsCallableFromURL<
        UpdatePosLessonConfigRequest,
        UpdatePosLessonConfigResponse
      >(
        getMapleFunctions(),
        routerCallableUrl('settings', 'updatePosLessonConfig')
      );
      const result = await fn({ lessonCatalogObjectIds });
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
