'use client';

import { useState, useCallback, useEffect } from 'react';
import { callDeduped } from './call-deduped';
import type { PosLessonAttributionSummary, RequestState } from '@maple/ts/domain';
import type {
  GetPosLessonAttributionSummaryRequest,
  GetPosLessonAttributionSummaryResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Lightweight POS-lesson-attribution summary for the nav badge (pending
 * count), without loading the full queue. Mirrors useSyncConflictSummary.
 *
 * @param enabled - Pass false to skip fetching (getPosLessonAttributionSummary
 * is admin-only, so a non-admin fetch would just 403).
 */
export function usePosLessonAttributionSummary(enabled = true) {
  const [summaryState, setSummaryState] = useState<
    RequestState<PosLessonAttributionSummary>
  >({ status: 'idle' });

  const fetchSummary = useCallback(async () => {
    setSummaryState({ status: 'loading' });
    try {
      const result = await callDeduped<
        GetPosLessonAttributionSummaryRequest,
        GetPosLessonAttributionSummaryResponse
      >('getPosLessonAttributionSummary', {});
      setSummaryState({ status: 'success', data: result.data.summary });
    } catch (error) {
      console.error('Failed to fetch POS lesson summary:', error);
      setSummaryState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to fetch summary',
      });
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetchSummary();
  }, [enabled, fetchSummary]);

  return { summaryState, fetchSummary };
}
