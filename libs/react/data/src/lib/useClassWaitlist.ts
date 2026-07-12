'use client';

import { useState, useCallback, useEffect } from 'react';
import { callDeduped } from './call-deduped';
import type { ClassWaitlistEntry, RequestState } from '@maple/ts/domain';
import type {
  GetClassWaitlistRequest,
  GetClassWaitlistResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Hook for reading a class's waitlist (admin). Returns the entries as a
 * RequestState plus the server-reported count. No mutations — the class
 * waitlist is cleared automatically when a spot opens.
 *
 * Pass `undefined`/empty `classId` to stay idle (e.g. before the route param
 * resolves) rather than firing a doomed request.
 */
export function useClassWaitlist(classId?: string) {
  const [waitlistState, setWaitlistState] = useState<
    RequestState<ClassWaitlistEntry[]>
  >({ status: 'idle' });

  const fetchWaitlist = useCallback(async () => {
    if (!classId) {
      setWaitlistState({ status: 'idle' });
      return;
    }

    setWaitlistState({ status: 'loading' });

    try {
      const result = await callDeduped<
        GetClassWaitlistRequest,
        GetClassWaitlistResponse
      >('getClassWaitlist', { classId });
      setWaitlistState({ status: 'success', data: result.data.entries });
    } catch (error) {
      console.error('Failed to fetch class waitlist:', error);
      setWaitlistState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch class waitlist',
      });
    }
  }, [classId]);

  useEffect(() => {
    fetchWaitlist();
  }, [fetchWaitlist]);

  return { waitlistState, fetchWaitlist };
}
