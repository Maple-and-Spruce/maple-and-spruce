'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type { RequestState } from '@maple/ts/domain';
import type {
  GetMyWeekRequest,
  GetMyWeekResponse,
} from '@maple/ts/firebase/api-types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Hook for the teacher "My Week" tab (#685): the signed-in teacher's
 * commitments + blocks for the week starting at `weekStart` (a local Sunday
 * 00:00). Refetches when the week changes.
 */
export function useMyWeek(weekStart: Date) {
  const [weekState, setWeekState] = useState<RequestState<GetMyWeekResponse>>({
    status: 'idle',
  });

  const startMs = weekStart.getTime();

  const fetchWeek = useCallback(async () => {
    setWeekState({ status: 'loading' });
    try {
      const from = new Date(startMs).toISOString();
      const to = new Date(startMs + 7 * DAY_MS).toISOString();
      const fn = httpsCallable<GetMyWeekRequest, GetMyWeekResponse>(
        getMapleFunctions(),
        'getMyWeek',
      );
      const result = await fn({ from, to });
      setWeekState({ status: 'success', data: result.data });
    } catch (error) {
      console.error('Failed to fetch My Week:', error);
      setWeekState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to fetch',
      });
    }
  }, [startMs]);

  useEffect(() => {
    fetchWeek();
  }, [fetchWeek]);

  return { weekState, fetchWeek };
}
