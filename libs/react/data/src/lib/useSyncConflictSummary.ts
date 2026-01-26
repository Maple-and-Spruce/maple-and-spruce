'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type { SyncConflictSummary, RequestState } from '@maple/ts/domain';
import type {
  GetSyncConflictSummaryRequest,
  GetSyncConflictSummaryResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Lightweight hook for fetching sync conflict summary
 *
 * Use this in the navigation to show badge counts without
 * fetching the full list of conflicts.
 *
 * @see ADR-012 for sync conflict detection and resolution strategy
 */
export function useSyncConflictSummary() {
  const [summaryState, setSummaryState] = useState<
    RequestState<SyncConflictSummary>
  >({
    status: 'idle',
  });

  /**
   * Fetch summary of sync conflicts (for nav badge)
   */
  const fetchSummary = useCallback(async () => {
    setSummaryState({ status: 'loading' });

    try {
      const functions = getMapleFunctions();
      const getSyncConflictSummary = httpsCallable<
        GetSyncConflictSummaryRequest,
        GetSyncConflictSummaryResponse
      >(functions, 'getSyncConflictSummary');

      const result = await getSyncConflictSummary({});
      setSummaryState({
        status: 'success',
        data: result.data.summary,
      });
    } catch (error) {
      console.error('Failed to fetch sync conflict summary:', error);
      setSummaryState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch sync conflict summary',
      });
    }
  }, []);

  // Fetch summary on mount
  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return {
    summaryState,
    fetchSummary,
  };
}
