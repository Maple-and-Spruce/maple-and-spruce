'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  CalendarEmbedConfig,
  UpdateCalendarEmbedSettingsInput,
  CreateCalendarEmbedSourceInput,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetCalendarEmbedConfigRequest,
  GetCalendarEmbedConfigResponse,
  UpdateCalendarEmbedConfigRequest,
  UpdateCalendarEmbedConfigResponse,
  AddCalendarEmbedSourceRequest,
  AddCalendarEmbedSourceResponse,
  RemoveCalendarEmbedSourceRequest,
  RemoveCalendarEmbedSourceResponse,
} from '@maple/ts/firebase/api-types';

export function useCalendarEmbedConfig() {
  const [configState, setConfigState] = useState<
    RequestState<CalendarEmbedConfig>
  >({ status: 'idle' });

  const fetchConfig = useCallback(async () => {
    setConfigState({ status: 'loading' });
    try {
      const functions = getMapleFunctions();
      const getConfig = httpsCallable<
        GetCalendarEmbedConfigRequest,
        GetCalendarEmbedConfigResponse
      >(functions, 'getCalendarEmbedConfig');

      const result = await getConfig({});
      setConfigState({ status: 'success', data: result.data.config });
    } catch (error) {
      console.error('Failed to fetch calendar embed config:', error);
      setConfigState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch calendar embed config',
      });
    }
  }, []);

  const updateSettings = useCallback(
    async (
      input: UpdateCalendarEmbedSettingsInput
    ): Promise<CalendarEmbedConfig> => {
      const functions = getMapleFunctions();
      const update = httpsCallable<
        UpdateCalendarEmbedConfigRequest,
        UpdateCalendarEmbedConfigResponse
      >(functions, 'updateCalendarEmbedConfig');

      const result = await update(input);
      setConfigState({ status: 'success', data: result.data.config });
      return result.data.config;
    },
    []
  );

  const addSource = useCallback(
    async (
      input: CreateCalendarEmbedSourceInput
    ): Promise<CalendarEmbedConfig> => {
      const functions = getMapleFunctions();
      const add = httpsCallable<
        AddCalendarEmbedSourceRequest,
        AddCalendarEmbedSourceResponse
      >(functions, 'addCalendarEmbedSource');

      const result = await add(input);
      setConfigState({ status: 'success', data: result.data.config });
      return result.data.config;
    },
    []
  );

  const removeSource = useCallback(
    async (sourceId: string): Promise<CalendarEmbedConfig> => {
      const functions = getMapleFunctions();
      const remove = httpsCallable<
        RemoveCalendarEmbedSourceRequest,
        RemoveCalendarEmbedSourceResponse
      >(functions, 'removeCalendarEmbedSource');

      const result = await remove({ sourceId });
      setConfigState({ status: 'success', data: result.data.config });
      return result.data.config;
    },
    []
  );

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return {
    configState,
    fetchConfig,
    updateSettings,
    addSource,
    removeSource,
  };
}
