'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import { callDeduped } from './call-deduped';
import type {
  MusicTogetherDemo,
  CreateMusicTogetherDemoInput,
  UpdateMusicTogetherDemoInput,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetMusicTogetherDemosRequest,
  GetMusicTogetherDemosResponse,
  MusicTogetherDemoCounts,
  CreateMusicTogetherDemoRequest,
  CreateMusicTogetherDemoResponse,
  UpdateMusicTogetherDemoRequest,
  UpdateMusicTogetherDemoResponse,
  DeleteMusicTogetherDemoRequest,
  DeleteMusicTogetherDemoResponse,
} from '@maple/ts/firebase/api-types';

/** Hydrate ISO date strings (callable serialization) back into Dates. */
function hydrateDemo(demo: MusicTogetherDemo): MusicTogetherDemo {
  return {
    ...demo,
    dateTime: new Date(demo.dateTime),
    createdAt: new Date(demo.createdAt),
  };
}

function demoMs(demo: MusicTogetherDemo): number {
  return new Date(demo.dateTime).getTime();
}

/**
 * Hook for managing Music Together demo-class CRUD in the admin app.
 */
export function useMusicTogetherDemos() {
  const [demosState, setDemosState] = useState<
    RequestState<MusicTogetherDemo[]>
  >({ status: 'idle' });
  const [countsByDemo, setCountsByDemo] = useState<
    Record<string, MusicTogetherDemoCounts>
  >({});

  const fetchDemos = useCallback(async () => {
    setDemosState({ status: 'loading' });
    try {
      const result = await callDeduped<
        GetMusicTogetherDemosRequest,
        GetMusicTogetherDemosResponse
      >('getMusicTogetherDemos', {});
      setDemosState({
        status: 'success',
        data: result.data.demos
          .map(hydrateDemo)
          .sort((a, b) => demoMs(a) - demoMs(b)),
      });
      setCountsByDemo(result.data.counts ?? {});
    } catch (error) {
      console.error('Failed to fetch Music Together demos:', error);
      setDemosState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to fetch demos',
      });
    }
  }, []);

  const createDemo = useCallback(
    async (input: CreateMusicTogetherDemoInput): Promise<MusicTogetherDemo> => {
      const functions = getMapleFunctions();
      const create = httpsCallable<
        CreateMusicTogetherDemoRequest,
        CreateMusicTogetherDemoResponse
      >(functions, 'createMusicTogetherDemo');
      const result = await create(input);
      const demo = hydrateDemo(result.data.demo);
      setDemosState((prev) => {
        if (prev.status !== 'success') return prev;
        return {
          ...prev,
          data: [...prev.data, demo].sort((a, b) => demoMs(a) - demoMs(b)),
        };
      });
      return demo;
    },
    []
  );

  const updateDemo = useCallback(
    async (input: UpdateMusicTogetherDemoInput): Promise<MusicTogetherDemo> => {
      const functions = getMapleFunctions();
      const update = httpsCallable<
        UpdateMusicTogetherDemoRequest,
        UpdateMusicTogetherDemoResponse
      >(functions, 'updateMusicTogetherDemo');
      const result = await update(input);
      const demo = hydrateDemo(result.data.demo);
      setDemosState((prev) => {
        if (prev.status !== 'success') return prev;
        return {
          ...prev,
          data: prev.data
            .map((d) => (d.id === demo.id ? demo : d))
            .sort((a, b) => demoMs(a) - demoMs(b)),
        };
      });
      return demo;
    },
    []
  );

  const deleteDemo = useCallback(async (id: string): Promise<void> => {
    const functions = getMapleFunctions();
    const del = httpsCallable<
      DeleteMusicTogetherDemoRequest,
      DeleteMusicTogetherDemoResponse
    >(functions, 'deleteMusicTogetherDemo');
    await del({ id });
    setDemosState((prev) => {
      if (prev.status !== 'success') return prev;
      return { ...prev, data: prev.data.filter((d) => d.id !== id) };
    });
  }, []);

  useEffect(() => {
    fetchDemos();
  }, [fetchDemos]);

  return {
    demosState,
    countsByDemo,
    fetchDemos,
    createDemo,
    updateDemo,
    deleteDemo,
  };
}
