'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallableFromURL } from 'firebase/functions';
import {
  getMapleFunctions,
  routerCallableUrl,
} from '@maple/ts/firebase/firebase-config';
import type { RequestState } from '@maple/ts/domain';
import type {
  GetStudioDayRequest,
  GetStudioDayResponse,
} from '@maple/ts/firebase/api-types';

/** The wire carries dates as ISO strings; give the lessons real Dates back. */
function hydrateStudioDay(data: GetStudioDayResponse): GetStudioDayResponse {
  return {
    lessons: data.lessons.map((entry) => ({
      ...entry,
      lesson: {
        ...entry.lesson,
        scheduledAt: new Date(entry.lesson.scheduledAt),
        createdAt: new Date(entry.lesson.createdAt),
        updatedAt: new Date(entry.lesson.updatedAt),
      },
    })),
  };
}

/**
 * Every teacher's lessons for today (#235), for the admin Home dashboard.
 * Admin-only server-side, so mount it with `enabled` false for anyone else —
 * a clerk's dashboard shows classes only and never calls this.
 */
export function useStudioDay(enabled = true) {
  const [dayState, setDayState] = useState<
    RequestState<GetStudioDayResponse>
  >({ status: 'idle' });

  const fetchDay = useCallback(async () => {
    setDayState({ status: 'loading' });
    try {
      // "Today" in the viewer's own timezone (the browser's).
      const now = new Date();
      const from = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      ).toISOString();
      const to = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        23,
        59,
        59,
        999
      ).toISOString();

      const fn = httpsCallableFromURL<GetStudioDayRequest, GetStudioDayResponse>(
        getMapleFunctions(),
        routerCallableUrl('lessons', 'getStudioDay')
      );
      const result = await fn({ from, to });
      setDayState({ status: 'success', data: hydrateStudioDay(result.data) });
    } catch (error) {
      console.error('Failed to fetch the studio day:', error);
      setDayState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to fetch',
      });
    }
  }, []);

  useEffect(() => {
    if (enabled) fetchDay();
  }, [enabled, fetchDay]);

  return { dayState, fetchDay };
}
