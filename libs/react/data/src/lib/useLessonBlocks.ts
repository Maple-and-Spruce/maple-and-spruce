'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  LessonBlock,
  CreateLessonBlockInput,
  UpdateLessonBlockInput,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetLessonBlocksRequest,
  GetLessonBlocksResponse,
  CreateLessonBlockRequest,
  CreateLessonBlockResponse,
  UpdateLessonBlockRequest,
  UpdateLessonBlockResponse,
  DeleteLessonBlockRequest,
  DeleteLessonBlockResponse,
} from '@maple/ts/firebase/api-types';

/** Coerce ISO timestamps from the callable back to Date. */
function hydrateBlock(block: LessonBlock): LessonBlock {
  return {
    ...block,
    createdAt: new Date(block.createdAt),
    updatedAt: new Date(block.updatedAt),
  };
}

/** Weekday-then-start ordering for stable listing. */
function byWeekdayThenStart(a: LessonBlock, b: LessonBlock): number {
  return a.dayOfWeek - b.dayOfWeek || a.startMinutes - b.startMinutes;
}

export interface UseLessonBlocksOptions {
  /** Scope the fetch to one teacher; omit for all blocks. */
  teacherId?: string;
  /** Fetch on mount (default true). */
  autoFetch?: boolean;
}

/**
 * Hook for managing lesson-block CRUD (#686/#689). Blocks are the weekly
 * constraint windows lessons must fall inside. Create/update/delete are
 * admin-only server-side; this hook just calls the callables.
 */
export function useLessonBlocks(options: UseLessonBlocksOptions = {}) {
  const { teacherId, autoFetch = true } = options;
  const [lessonBlocksState, setLessonBlocksState] = useState<
    RequestState<LessonBlock[]>
  >({ status: 'idle' });

  const fetchLessonBlocks = useCallback(async () => {
    setLessonBlocksState({ status: 'loading' });
    try {
      const functions = getMapleFunctions();
      const getBlocks = httpsCallable<
        GetLessonBlocksRequest,
        GetLessonBlocksResponse
      >(functions, 'getLessonBlocks');

      const result = await getBlocks({ teacherId });
      setLessonBlocksState({
        status: 'success',
        data: result.data.blocks.map(hydrateBlock).sort(byWeekdayThenStart),
      });
    } catch (error) {
      console.error('Failed to fetch lesson blocks:', error);
      setLessonBlocksState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch lesson blocks',
      });
    }
  }, [teacherId]);

  const createLessonBlock = useCallback(
    async (input: CreateLessonBlockInput): Promise<LessonBlock> => {
      const functions = getMapleFunctions();
      const create = httpsCallable<
        CreateLessonBlockRequest,
        CreateLessonBlockResponse
      >(functions, 'createLessonBlock');

      const result = await create(input);
      const block = hydrateBlock(result.data.block);

      setLessonBlocksState((prev) => {
        if (prev.status !== 'success') return prev;
        return {
          ...prev,
          data: [...prev.data, block].sort(byWeekdayThenStart),
        };
      });

      return block;
    },
    [],
  );

  const updateLessonBlock = useCallback(
    async (input: UpdateLessonBlockInput): Promise<LessonBlock> => {
      const functions = getMapleFunctions();
      const update = httpsCallable<
        UpdateLessonBlockRequest,
        UpdateLessonBlockResponse
      >(functions, 'updateLessonBlock');

      const result = await update(input);
      const block = hydrateBlock(result.data.block);

      setLessonBlocksState((prev) => {
        if (prev.status !== 'success') return prev;
        return {
          ...prev,
          data: prev.data
            .map((b) => (b.id === block.id ? block : b))
            .sort(byWeekdayThenStart),
        };
      });

      return block;
    },
    [],
  );

  const deleteLessonBlock = useCallback(async (id: string): Promise<void> => {
    const functions = getMapleFunctions();
    const del = httpsCallable<
      DeleteLessonBlockRequest,
      DeleteLessonBlockResponse
    >(functions, 'deleteLessonBlock');

    await del({ id });

    setLessonBlocksState((prev) => {
      if (prev.status !== 'success') return prev;
      return { ...prev, data: prev.data.filter((b) => b.id !== id) };
    });
  }, []);

  useEffect(() => {
    if (autoFetch) fetchLessonBlocks();
  }, [autoFetch, fetchLessonBlocks]);

  return {
    lessonBlocksState,
    fetchLessonBlocks,
    createLessonBlock,
    updateLessonBlock,
    deleteLessonBlock,
  };
}
