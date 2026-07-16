'use client';

import { useState, useCallback, useEffect } from 'react';
import { callDeduped } from './call-deduped';
import type { MusicTogetherInterest, RequestState } from '@maple/ts/domain';
import type {
  GetMusicTogetherInterestRequest,
  GetMusicTogetherInterestResponse,
} from '@maple/ts/firebase/api-types';

/** Hydrate ISO date strings (callable serialization) back into Dates. */
function hydrateEntry(entry: MusicTogetherInterest): MusicTogetherInterest {
  return {
    ...entry,
    createdAt: new Date(entry.createdAt),
    updatedAt: new Date(entry.updatedAt),
  };
}

/**
 * Loads the cross-section Music Together interest list for the admin demand
 * view — the raw entries plus a per-section demand tally and section names.
 */
export function useMusicTogetherInterest() {
  const [interestState, setInterestState] = useState<
    RequestState<GetMusicTogetherInterestResponse>
  >({ status: 'idle' });

  const fetchInterest = useCallback(async () => {
    setInterestState({ status: 'loading' });
    try {
      const result = await callDeduped<
        GetMusicTogetherInterestRequest,
        GetMusicTogetherInterestResponse
      >('getMusicTogetherInterest', {});
      setInterestState({
        status: 'success',
        data: {
          entries: result.data.entries.map(hydrateEntry),
          demand: result.data.demand,
          sectionNames: result.data.sectionNames,
        },
      });
    } catch (error) {
      console.error('Failed to fetch Music Together interest list:', error);
      setInterestState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch interest list',
      });
    }
  }, []);

  useEffect(() => {
    fetchInterest();
  }, [fetchInterest]);

  return { interestState, fetchInterest };
}
