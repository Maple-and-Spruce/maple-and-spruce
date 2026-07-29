'use client';

import { useState, useCallback, useEffect } from 'react';
import { callDeduped } from './call-deduped';
import type { MusicTogetherDemoRsvp, RequestState } from '@maple/ts/domain';
import type {
  GetMusicTogetherDemoRsvpsRequest,
  GetMusicTogetherDemoRsvpsResponse,
} from '@maple/ts/firebase/api-types';

/** Hydrate the ISO createdAt (callable serialization) back into a Date. */
function hydrateRsvp(rsvp: MusicTogetherDemoRsvp): MusicTogetherDemoRsvp {
  return { ...rsvp, createdAt: new Date(rsvp.createdAt) };
}

/**
 * Loads the free Music Together demo-class RSVPs for the admin viewer so the
 * Owner / MT teacher can see who's coming to each demo and follow up.
 */
export function useMusicTogetherDemoRsvps() {
  const [demoRsvpsState, setDemoRsvpsState] = useState<
    RequestState<GetMusicTogetherDemoRsvpsResponse>
  >({ status: 'idle' });

  const fetchDemoRsvps = useCallback(async () => {
    setDemoRsvpsState({ status: 'loading' });
    try {
      const result = await callDeduped<
        GetMusicTogetherDemoRsvpsRequest,
        GetMusicTogetherDemoRsvpsResponse
      >('getMusicTogetherDemoRsvps', {});
      setDemoRsvpsState({
        status: 'success',
        data: { rsvps: result.data.rsvps.map(hydrateRsvp) },
      });
    } catch (error) {
      console.error('Failed to fetch Music Together demo RSVPs:', error);
      setDemoRsvpsState({
        status: 'error',
        error:
          error instanceof Error ? error.message : 'Failed to fetch demo RSVPs',
      });
    }
  }, []);

  useEffect(() => {
    fetchDemoRsvps();
  }, [fetchDemoRsvps]);

  return { demoRsvpsState, fetchDemoRsvps };
}
