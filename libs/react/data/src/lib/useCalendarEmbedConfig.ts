'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallableFromURL } from 'firebase/functions';
import {
  getMapleFunctions,
  routerCallableUrl,
} from '@maple/ts/firebase/firebase-config';
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
      const getConfig = httpsCallableFromURL<
        GetCalendarEmbedConfigRequest,
        GetCalendarEmbedConfigResponse
      >(functions, routerCallableUrl('calendar', 'getCalendarEmbedConfig'));

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
      const update = httpsCallableFromURL<
        UpdateCalendarEmbedConfigRequest,
        UpdateCalendarEmbedConfigResponse
      >(functions, routerCallableUrl('calendar', 'updateCalendarEmbedConfig'));

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
      const add = httpsCallableFromURL<
        AddCalendarEmbedSourceRequest,
        AddCalendarEmbedSourceResponse
      >(functions, routerCallableUrl('calendar', 'addCalendarEmbedSource'));

      const result = await add(input);
      setConfigState({ status: 'success', data: result.data.config });
      return result.data.config;
    },
    []
  );

  const removeSource = useCallback(
    async (sourceId: string): Promise<CalendarEmbedConfig> => {
      const functions = getMapleFunctions();
      const remove = httpsCallableFromURL<
        RemoveCalendarEmbedSourceRequest,
        RemoveCalendarEmbedSourceResponse
      >(functions, routerCallableUrl('calendar', 'removeCalendarEmbedSource'));

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
