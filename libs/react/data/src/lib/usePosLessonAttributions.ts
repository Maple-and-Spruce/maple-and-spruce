'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  PosLessonAttribution,
  PosLessonAttributionSummary,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetPosLessonAttributionsRequest,
  GetPosLessonAttributionsResponse,
  GetPosLessonAttributionSummaryRequest,
  GetPosLessonAttributionSummaryResponse,
  PosLessonResolution,
  ResolvePosLessonAttributionRequest,
  ResolvePosLessonAttributionResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Hook for the POS lesson attribution review queue (#628): list + resolve
 * (attribute to a student, or dismiss), plus a status summary for the badge.
 */
export function usePosLessonAttributions() {
  const [attributionsState, setAttributionsState] = useState<
    RequestState<PosLessonAttribution[]>
  >({ status: 'idle' });
  const [summaryState, setSummaryState] = useState<
    RequestState<PosLessonAttributionSummary>
  >({ status: 'idle' });

  const fetchAttributions = useCallback(async () => {
    setAttributionsState({ status: 'loading' });
    try {
      const fn = httpsCallable<
        GetPosLessonAttributionsRequest,
        GetPosLessonAttributionsResponse
      >(getMapleFunctions(), 'getPosLessonAttributions');
      const result = await fn({});
      setAttributionsState({
        status: 'success',
        data: result.data.attributions,
      });
    } catch (error) {
      console.error('Failed to fetch POS lesson attributions:', error);
      setAttributionsState({
        status: 'error',
        error:
          error instanceof Error ? error.message : 'Failed to fetch attributions',
      });
    }
  }, []);

  const fetchSummary = useCallback(async () => {
    setSummaryState({ status: 'loading' });
    try {
      const fn = httpsCallable<
        GetPosLessonAttributionSummaryRequest,
        GetPosLessonAttributionSummaryResponse
      >(getMapleFunctions(), 'getPosLessonAttributionSummary');
      const result = await fn({});
      setSummaryState({ status: 'success', data: result.data.summary });
    } catch (error) {
      console.error('Failed to fetch POS lesson summary:', error);
      setSummaryState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to fetch summary',
      });
    }
  }, []);

  const resolveAttribution = useCallback(
    async (
      attributionId: string,
      action: PosLessonResolution,
      opts?: { studentId?: string; notes?: string }
    ): Promise<PosLessonAttribution> => {
      const fn = httpsCallable<
        ResolvePosLessonAttributionRequest,
        ResolvePosLessonAttributionResponse
      >(getMapleFunctions(), 'resolvePosLessonAttribution');
      const result = await fn({
        attributionId,
        action,
        studentId: opts?.studentId,
        notes: opts?.notes,
      });

      setAttributionsState((prev) => {
        if (prev.status !== 'success') return prev;
        return {
          ...prev,
          data: prev.data.map((a) =>
            a.id === result.data.attribution.id ? result.data.attribution : a
          ),
        };
      });
      fetchSummary();
      return result.data.attribution;
    },
    [fetchSummary]
  );

  useEffect(() => {
    fetchAttributions();
    fetchSummary();
  }, [fetchAttributions, fetchSummary]);

  return {
    attributionsState,
    summaryState,
    fetchAttributions,
    fetchSummary,
    resolveAttribution,
  };
}
