'use client';

import { useState, useCallback, useEffect } from 'react';
import { callDeduped } from './call-deduped';
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
 *
 * @param enabled - Pass false to skip fetching (e.g. for non-admin roles
 * — getSyncConflictSummary is admin-only, so fetching would just 403).
 * The state stays 'idle' while disabled and fetches when it flips true.
 */
export function useSyncConflictSummary(enabled = true) {
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
      const result = await callDeduped<
        GetSyncConflictSummaryRequest,
        GetSyncConflictSummaryResponse
      >('getSyncConflictSummary', {});
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

  // Fetch summary on mount (or when enabled flips true)
  useEffect(() => {
    if (!enabled) return;
    fetchSummary();
  }, [enabled, fetchSummary]);

  return {
    summaryState,
    fetchSummary,
  };
}
