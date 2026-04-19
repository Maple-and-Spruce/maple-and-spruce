'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type { RequestState } from '@maple/ts/domain';
import type {
  ListEtsyListingsRequest,
  ListEtsyListingsResponse,
  EtsyListingWithSyncInfo,
} from '@maple/ts/firebase/api-types';

export interface UseEtsyListingsOptions {
  /** Listing state to fetch (default: 'active'). */
  state?: ListEtsyListingsRequest['state'];
  /** Page size (default: 100; Etsy API max). */
  limit?: number;
  /** Auto-fetch on mount. Default: true. */
  autoFetch?: boolean;
}

/**
 * Fetches the connected Etsy shop's listings with sync info (imported
 * into our Product catalog yet? single-variant?). Read-only — the import
 * action is exposed via `useEtsyImport`.
 */
export function useEtsyListings({
  state = 'active',
  limit = 100,
  autoFetch = true,
}: UseEtsyListingsOptions = {}) {
  const [listingsState, setListingsState] = useState<
    RequestState<EtsyListingWithSyncInfo[]>
  >({ status: 'idle' });
  const [total, setTotal] = useState<number>(0);

  const fetchListings = useCallback(async (): Promise<void> => {
    setListingsState({ status: 'loading' });

    try {
      const functions = getMapleFunctions();
      const listFn = httpsCallable<
        ListEtsyListingsRequest,
        ListEtsyListingsResponse
      >(functions, 'listEtsyListings');

      const result = await listFn({ state, limit });
      setTotal(result.data.total);
      setListingsState({ status: 'success', data: result.data.listings });
    } catch (error) {
      console.error('Failed to fetch Etsy listings:', error);
      setListingsState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch Etsy listings',
      });
    }
  }, [state, limit]);

  useEffect(() => {
    if (autoFetch) {
      fetchListings();
    }
  }, [autoFetch, fetchListings]);

  return {
    listingsState,
    total,
    fetchListings,
  };
}
