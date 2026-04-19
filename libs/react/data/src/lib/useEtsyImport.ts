'use client';

import { useState, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type { RequestState } from '@maple/ts/domain';
import type {
  ImportEtsyListingsRequest,
  ImportEtsyListingsResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Calls the bulk importEtsyListings Cloud Function. Tracks an in-flight
 * RequestState and exposes the last response so the page can show a
 * per-row success/failure summary after the call resolves.
 */
export function useEtsyImport() {
  const [importState, setImportState] = useState<
    RequestState<ImportEtsyListingsResponse>
  >({ status: 'idle' });

  const importListings = useCallback(
    async (
      request: ImportEtsyListingsRequest
    ): Promise<ImportEtsyListingsResponse> => {
      setImportState({ status: 'loading' });
      try {
        const functions = getMapleFunctions();
        const importFn = httpsCallable<
          ImportEtsyListingsRequest,
          ImportEtsyListingsResponse
        >(functions, 'importEtsyListings');
        const result = await importFn(request);
        setImportState({ status: 'success', data: result.data });
        return result.data;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to import Etsy listings';
        setImportState({ status: 'error', error: message });
        throw error;
      }
    },
    []
  );

  const reset = useCallback(() => {
    setImportState({ status: 'idle' });
  }, []);

  return {
    importState,
    importListings,
    reset,
  };
}
