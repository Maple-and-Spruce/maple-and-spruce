'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import { callDeduped } from './call-deduped';
import type {
  MusicTogetherSection,
  CreateMusicTogetherSectionInput,
  UpdateMusicTogetherSectionInput,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetMusicTogetherSectionsRequest,
  GetMusicTogetherSectionsResponse,
  MusicTogetherSectionCounts,
  CreateMusicTogetherSectionRequest,
  CreateMusicTogetherSectionResponse,
  UpdateMusicTogetherSectionRequest,
  UpdateMusicTogetherSectionResponse,
} from '@maple/ts/firebase/api-types';

export interface UseMusicTogetherSectionsFilters {
  /** Optionally scope to a single semester. */
  semesterId?: string;
}

/** Hydrate ISO date strings (callable serialization) back into Dates. */
function hydrateSection(section: MusicTogetherSection): MusicTogetherSection {
  return {
    ...section,
    sessions: (section.sessions ?? []).map((s) => ({
      dateTime: new Date(s.dateTime),
    })),
    installmentPlan: section.installmentPlan?.map((i) => ({
      amountCents: i.amountCents,
      dueAt: new Date(i.dueAt),
    })),
    createdAt: new Date(section.createdAt),
    updatedAt: new Date(section.updatedAt),
  };
}

function firstSessionMs(section: MusicTogetherSection): number {
  return section.sessions?.[0]
    ? new Date(section.sessions[0].dateTime).getTime()
    : 0;
}

/**
 * Hook for managing Music Together section CRUD in the admin app.
 */
export function useMusicTogetherSections(
  filters?: UseMusicTogetherSectionsFilters
) {
  const [sectionsState, setSectionsState] = useState<
    RequestState<MusicTogetherSection[]>
  >({ status: 'idle' });
  // Per-section registration counts (families + children), keyed by section id.
  const [countsBySection, setCountsBySection] = useState<
    Record<string, MusicTogetherSectionCounts>
  >({});

  const fetchSections = useCallback(async () => {
    setSectionsState({ status: 'loading' });
    try {
      const result = await callDeduped<
        GetMusicTogetherSectionsRequest,
        GetMusicTogetherSectionsResponse
      >('getMusicTogetherSections', { semesterId: filters?.semesterId });
      setSectionsState({
        status: 'success',
        data: result.data.sections
          .map(hydrateSection)
          .sort((a, b) => firstSessionMs(a) - firstSessionMs(b)),
      });
      setCountsBySection(result.data.counts ?? {});
    } catch (error) {
      console.error('Failed to fetch Music Together sections:', error);
      setSectionsState({
        status: 'error',
        error:
          error instanceof Error ? error.message : 'Failed to fetch sections',
      });
    }
  }, [filters?.semesterId]);

  const createSection = useCallback(
    async (
      input: CreateMusicTogetherSectionInput
    ): Promise<MusicTogetherSection> => {
      const functions = getMapleFunctions();
      const create = httpsCallable<
        CreateMusicTogetherSectionRequest,
        CreateMusicTogetherSectionResponse
      >(functions, 'createMusicTogetherSection');
      const result = await create(input);
      const section = hydrateSection(result.data.section);
      setSectionsState((prev) => {
        if (prev.status !== 'success') return prev;
        return {
          ...prev,
          data: [...prev.data, section].sort(
            (a, b) => firstSessionMs(a) - firstSessionMs(b)
          ),
        };
      });
      return section;
    },
    []
  );

  const updateSection = useCallback(
    async (
      input: UpdateMusicTogetherSectionInput
    ): Promise<MusicTogetherSection> => {
      const functions = getMapleFunctions();
      const update = httpsCallable<
        UpdateMusicTogetherSectionRequest,
        UpdateMusicTogetherSectionResponse
      >(functions, 'updateMusicTogetherSection');
      const result = await update(input);
      const section = hydrateSection(result.data.section);
      setSectionsState((prev) => {
        if (prev.status !== 'success') return prev;
        return {
          ...prev,
          data: prev.data
            .map((s) => (s.id === section.id ? section : s))
            .sort((a, b) => firstSessionMs(a) - firstSessionMs(b)),
        };
      });
      return section;
    },
    []
  );

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  return {
    sectionsState,
    countsBySection,
    fetchSections,
    createSection,
    updateSection,
  };
}
