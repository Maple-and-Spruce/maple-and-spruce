'use client';

import { useState, useCallback, useEffect } from 'react';
import { callDeduped } from './call-deduped';
import type { RequestState } from '@maple/ts/domain';
import type {
  GetMusicTogetherRosterRequest,
  GetMusicTogetherRosterResponse,
  MusicTogetherRosterEntry,
} from '@maple/ts/firebase/api-types';

/** Hydrate ISO date strings in a roster entry back into Dates. */
function hydrateEntry(entry: MusicTogetherRosterEntry): MusicTogetherRosterEntry {
  return {
    ...entry,
    registration: {
      ...entry.registration,
      children: (entry.registration.children ?? []).map((c) => ({
        name: c.name,
        dob: new Date(c.dob),
      })),
      createdAt: new Date(entry.registration.createdAt),
      updatedAt: new Date(entry.registration.updatedAt),
    },
    charges: (entry.charges ?? []).map((c) => ({
      ...c,
      dueAt: new Date(c.dueAt),
    })),
  };
}

/**
 * Hook that loads a Music Together section's roster (enrolled families +
 * scheduled-charge status). Pass `undefined` to stay idle (no section open).
 */
export function useMusicTogetherRoster(sectionId: string | undefined) {
  const [rosterState, setRosterState] = useState<
    RequestState<GetMusicTogetherRosterResponse>
  >({ status: 'idle' });

  const fetchRoster = useCallback(async () => {
    if (!sectionId) {
      setRosterState({ status: 'idle' });
      return;
    }
    setRosterState({ status: 'loading' });
    try {
      const result = await callDeduped<
        GetMusicTogetherRosterRequest,
        GetMusicTogetherRosterResponse
      >('getMusicTogetherRoster', { sectionId });
      setRosterState({
        status: 'success',
        data: {
          section: result.data.section,
          entries: result.data.entries.map(hydrateEntry),
        },
      });
    } catch (error) {
      console.error('Failed to fetch Music Together roster:', error);
      setRosterState({
        status: 'error',
        error:
          error instanceof Error ? error.message : 'Failed to fetch roster',
      });
    }
  }, [sectionId]);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  return { rosterState, fetchRoster };
}
