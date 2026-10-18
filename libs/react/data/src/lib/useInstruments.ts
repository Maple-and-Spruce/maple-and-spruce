'use client';

import { useCallback, useEffect, useState } from 'react';
import { httpsCallableFromURL } from 'firebase/functions';
import {
  getMapleFunctions,
  routerCallableUrl,
} from '@maple/ts/firebase/firebase-config';
import type { InstrumentOption, RequestState } from '@maple/ts/domain';
import type {
  GetInstrumentsRequest,
  GetInstrumentsResponse,
  SaveInstrumentsRequest,
  SaveInstrumentsResponse,
} from '@maple/ts/firebase/api-types';

/**
 * The instruments the studio teaches (#161), from the `settings` router.
 */
export function useInstruments() {
  const [instrumentsState, setInstrumentsState] = useState<
    RequestState<InstrumentOption[]>
  >({ status: 'idle' });
  const [isSaving, setIsSaving] = useState(false);

  const fetchInstruments = useCallback(async () => {
    setInstrumentsState({ status: 'loading' });
    try {
      const fn = httpsCallableFromURL<
        GetInstrumentsRequest,
        GetInstrumentsResponse
      >(getMapleFunctions(), routerCallableUrl('settings', 'getInstruments'));
      const result = await fn({});
      setInstrumentsState({ status: 'success', data: result.data.instruments });
    } catch (error) {
      setInstrumentsState({
        status: 'error',
        error:
          error instanceof Error ? error.message : 'Could not load instruments',
      });
    }
  }, []);

  const saveInstruments = useCallback(
    async (instruments: InstrumentOption[]): Promise<InstrumentOption[]> => {
      setIsSaving(true);
      try {
        const fn = httpsCallableFromURL<
          SaveInstrumentsRequest,
          SaveInstrumentsResponse
        >(getMapleFunctions(), routerCallableUrl('settings', 'saveInstruments'));
        const saved = (await fn({ instruments })).data.instruments;
        setInstrumentsState({ status: 'success', data: saved });
        return saved;
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchInstruments();
  }, [fetchInstruments]);

  return { instrumentsState, isSaving, fetchInstruments, saveInstruments };
}
