'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  Lesson,
  CreateLessonInput,
  UpdateLessonInput,
  CreateLessonSeriesInput,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetLessonsRequest,
  GetLessonsResponse,
  CreateLessonRequest,
  CreateLessonResponse,
  CreateLessonSeriesRequest,
  CreateLessonSeriesResponse,
  UpdateLessonRequest,
  UpdateLessonResponse,
  DeleteLessonRequest,
  DeleteLessonResponse,
} from '@maple/ts/firebase/api-types';

export interface UseLessonsOptions {
  /** If provided, scopes the list to a single student. */
  studentId?: string;
  /** Autofetch on mount. Defaults to true. */
  autoFetch?: boolean;
}

/**
 * Coerce a lesson's date fields back to Date instances. Cloud functions
 * return them as ISO strings in the JSON response.
 */
function hydrateLesson(lesson: Lesson): Lesson {
  return {
    ...lesson,
    scheduledAt: new Date(lesson.scheduledAt),
    createdAt: new Date(lesson.createdAt),
    updatedAt: new Date(lesson.updatedAt),
  };
}

/**
 * Hook for managing music lessons (CRUD + recurring series).
 *
 * Pass `{ studentId }` to scope the list to a student's lessons (student
 * detail page). Omit for the global list.
 */
export function useLessons({
  studentId,
  autoFetch = true,
}: UseLessonsOptions = {}) {
  const [lessonsState, setLessonsState] = useState<RequestState<Lesson[]>>({
    status: 'idle',
  });

  const fetchLessons = useCallback(async () => {
    setLessonsState({ status: 'loading' });

    try {
      const functions = getMapleFunctions();
      const getLessons = httpsCallable<GetLessonsRequest, GetLessonsResponse>(
        functions,
        'getLessons'
      );

      const result = await getLessons({ studentId });
      setLessonsState({
        status: 'success',
        data: result.data.lessons.map(hydrateLesson),
      });
    } catch (error) {
      console.error('Failed to fetch lessons:', error);
      setLessonsState({
        status: 'error',
        error:
          error instanceof Error ? error.message : 'Failed to fetch lessons',
      });
    }
  }, [studentId]);

  const createLesson = useCallback(
    async (input: CreateLessonInput): Promise<Lesson> => {
      const functions = getMapleFunctions();
      const create = httpsCallable<
        CreateLessonRequest,
        CreateLessonResponse
      >(functions, 'createLesson');

      const result = await create(input);
      const lesson = hydrateLesson(result.data.lesson);

      setLessonsState((prev) => {
        if (prev.status !== 'success') return prev;
        const newData = [...prev.data, lesson].sort(
          (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()
        );
        return { ...prev, data: newData };
      });

      return lesson;
    },
    []
  );

  const createLessonSeries = useCallback(
    async (
      input: CreateLessonSeriesInput
    ): Promise<{ lessons: Lesson[]; seriesId: string }> => {
      const functions = getMapleFunctions();
      const create = httpsCallable<
        CreateLessonSeriesRequest,
        CreateLessonSeriesResponse
      >(functions, 'createLessonSeries');

      const result = await create(input);
      const lessons = result.data.lessons.map(hydrateLesson);

      setLessonsState((prev) => {
        if (prev.status !== 'success') return prev;
        const newData = [...prev.data, ...lessons].sort(
          (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()
        );
        return { ...prev, data: newData };
      });

      return { lessons, seriesId: result.data.seriesId };
    },
    []
  );

  const updateLesson = useCallback(
    async (input: UpdateLessonInput): Promise<Lesson> => {
      const functions = getMapleFunctions();
      const update = httpsCallable<
        UpdateLessonRequest,
        UpdateLessonResponse
      >(functions, 'updateLesson');

      const result = await update(input);
      const lesson = hydrateLesson(result.data.lesson);

      setLessonsState((prev) => {
        if (prev.status !== 'success') return prev;
        const newData = prev.data
          .map((l) => (l.id === lesson.id ? lesson : l))
          .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
        return { ...prev, data: newData };
      });

      return lesson;
    },
    []
  );

  const deleteLesson = useCallback(async (id: string): Promise<void> => {
    const functions = getMapleFunctions();
    const del = httpsCallable<DeleteLessonRequest, DeleteLessonResponse>(
      functions,
      'deleteLesson'
    );

    await del({ id });

    setLessonsState((prev) => {
      if (prev.status !== 'success') return prev;
      return { ...prev, data: prev.data.filter((l) => l.id !== id) };
    });
  }, []);

  useEffect(() => {
    if (autoFetch) {
      fetchLessons();
    }
  }, [fetchLessons, autoFetch]);

  return {
    lessonsState,
    fetchLessons,
    createLesson,
    createLessonSeries,
    updateLesson,
    deleteLesson,
  };
}
