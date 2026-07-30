'use client';

import { useState, useCallback, useEffect } from 'react';
import { callDeduped } from './call-deduped';
import type { RequestState } from '@maple/ts/domain';
import type {
  GetMusicTogetherDemoRsvpsRequest,
  GetMusicTogetherDemoRsvpsResponse,
  MusicTogetherDemoRsvpGroup,
} from '@maple/ts/firebase/api-types';

/** Hydrate ISO date strings (callable serialization) back into Dates. */
function hydrateGroup(
  group: MusicTogetherDemoRsvpGroup
): MusicTogetherDemoRsvpGroup {
  return {
    demo: {
      ...group.demo,
      dateTime: new Date(group.demo.dateTime),
      createdAt: new Date(group.demo.createdAt),
    },
    confirmed: group.confirmed.map((r) => ({
      ...r,
      createdAt: new Date(r.createdAt),
    })),
    waitlisted: group.waitlisted.map((r) => ({
      ...r,
      createdAt: new Date(r.createdAt),
    })),
  };
}

/**
 * Loads the free Music Together demo-class RSVPs (grouped per demo, split into
 * confirmed + waitlisted) for the admin viewer so the Owner / MT teacher can
 * see who's coming to each demo and follow up.
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
        data: { demos: result.data.demos.map(hydrateGroup) },
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
