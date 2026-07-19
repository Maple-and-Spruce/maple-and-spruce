'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type { PosLessonConfig, RequestState } from '@maple/ts/domain';
import type {
  GetPosLessonConfigRequest,
  GetPosLessonConfigResponse,
  UpdatePosLessonConfigRequest,
  UpdatePosLessonConfigResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Hook for the "POS lesson catalog items" config manager (#628): which Square
 * catalog object ids count as lessons when rung up at the POS.
 */
export function usePosLessonConfig() {
  const [configState, setConfigState] = useState<RequestState<PosLessonConfig>>({
    status: 'idle',
  });

  const fetchConfig = useCallback(async () => {
    setConfigState({ status: 'loading' });
    try {
      const fn = httpsCallable<
        GetPosLessonConfigRequest,
        GetPosLessonConfigResponse
      >(getMapleFunctions(), 'getPosLessonConfig');
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
      const fn = httpsCallable<
        UpdatePosLessonConfigRequest,
        UpdatePosLessonConfigResponse
      >(getMapleFunctions(), 'updatePosLessonConfig');
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
