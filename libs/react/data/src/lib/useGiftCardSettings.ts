'use client';

import { useCallback, useEffect, useState } from 'react';
import { httpsCallableFromURL } from 'firebase/functions';
import {
  getMapleFunctions,
  routerCallableUrl,
} from '@maple/ts/firebase/firebase-config';
import type { GiftCardAmountSettings, RequestState } from '@maple/ts/domain';
import type {
  GetGiftCardSettingsRequest,
  GetGiftCardSettingsResponse,
  UpdateGiftCardSettingsRequest,
  UpdateGiftCardSettingsResponse,
} from '@maple/ts/firebase/api-types';

/**
 * The dollar gift card amounts the website sells (#309), from the `settings`
 * router. Admin only.
 */
export function useGiftCardSettings() {
  const [settingsState, setSettingsState] = useState<
    RequestState<GiftCardAmountSettings>
  >({ status: 'idle' });
  const [isSaving, setIsSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    setSettingsState({ status: 'loading' });
    try {
      const fn = httpsCallableFromURL<
        GetGiftCardSettingsRequest,
        GetGiftCardSettingsResponse
      >(getMapleFunctions(), routerCallableUrl('settings', 'getGiftCardSettings'));
      const result = await fn({});
      setSettingsState({ status: 'success', data: result.data.settings });
    } catch (error) {
      setSettingsState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Could not load gift card amounts',
      });
    }
  }, []);

  /** Saves and returns what the server stored; throws on a refusal. */
  const saveSettings = useCallback(
    async (settings: GiftCardAmountSettings): Promise<GiftCardAmountSettings> => {
      setIsSaving(true);
      try {
        const fn = httpsCallableFromURL<
          UpdateGiftCardSettingsRequest,
          UpdateGiftCardSettingsResponse
        >(getMapleFunctions(), routerCallableUrl('settings', 'updateGiftCardSettings'));
        const saved = (await fn(settings)).data.settings;
        setSettingsState({ status: 'success', data: saved });
        return saved;
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return { settingsState, isSaving, fetchSettings, saveSettings };
}
