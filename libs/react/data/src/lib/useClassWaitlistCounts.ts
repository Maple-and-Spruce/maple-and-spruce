'use client';

import { useState, useCallback, useEffect } from 'react';
import { callDeduped } from './call-deduped';
import type { RequestState } from '@maple/ts/domain';
import type {
  GetClassWaitlistCountsRequest,
  GetClassWaitlistCountsResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Hook for reading waitlist counts for every class in one call (admin).
 * Returns a `classId -> count` map as a RequestState — mirrors how the
 * classes list derives registration counts. No mutations.
 */
export function useClassWaitlistCounts() {
  const [waitlistCountsState, setWaitlistCountsState] = useState<
    RequestState<Record<string, number>>
  >({ status: 'idle' });

  const fetchWaitlistCounts = useCallback(async () => {
    setWaitlistCountsState({ status: 'loading' });

    try {
      const result = await callDeduped<
        GetClassWaitlistCountsRequest,
        GetClassWaitlistCountsResponse
      >('getClassWaitlistCounts', {});
      setWaitlistCountsState({ status: 'success', data: result.data.counts });
    } catch (error) {
      console.error('Failed to fetch class waitlist counts:', error);
      setWaitlistCountsState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch class waitlist counts',
      });
    }
  }, []);

  useEffect(() => {
    fetchWaitlistCounts();
  }, [fetchWaitlistCounts]);

  return { waitlistCountsState, fetchWaitlistCounts };
}
