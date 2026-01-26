'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  Class,
  CreateClassInput,
  UpdateClassInput,
  ClassStatus,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetClassesRequest,
  GetClassesResponse,
  CreateClassRequest,
  CreateClassResponse,
  UpdateClassRequest,
  UpdateClassResponse,
  DeleteClassRequest,
  DeleteClassResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Filters for fetching classes
 */
export interface UseClassesFilters {
  status?: ClassStatus;
  categoryId?: string;
  instructorId?: string;
  upcoming?: boolean;
}

/**
 * Hook for managing class CRUD operations
 *
 * Provides state management and API calls for the class management system.
 */
export function useClasses(filters?: UseClassesFilters) {
  const [classesState, setClassesState] = useState<RequestState<Class[]>>({
    status: 'idle',
  });

  const fetchClasses = useCallback(async () => {
    setClassesState({ status: 'loading' });

    try {
      const functions = getMapleFunctions();
      const getClasses = httpsCallable<GetClassesRequest, GetClassesResponse>(
        functions,
        'getClasses'
      );

      const result = await getClasses({
        status: filters?.status,
        categoryId: filters?.categoryId,
        instructorId: filters?.instructorId,
        upcoming: filters?.upcoming,
      });
      setClassesState({
        status: 'success',
        data: result.data.classes,
      });
    } catch (error) {
      console.error('Failed to fetch classes:', error);
      setClassesState({
        status: 'error',
        error:
          error instanceof Error ? error.message : 'Failed to fetch classes',
      });
    }
  }, [filters?.status, filters?.categoryId, filters?.instructorId, filters?.upcoming]);

  const createClass = useCallback(
    async (input: CreateClassInput): Promise<Class> => {
      const functions = getMapleFunctions();
      const create = httpsCallable<CreateClassRequest, CreateClassResponse>(
        functions,
        'createClass'
      );

      const result = await create(input);

      // Add the new class to state
      setClassesState((prev) => {
        if (prev.status !== 'success') return prev;
        // Sort by dateTime after adding (soonest first)
        const newData = [...prev.data, result.data.class].sort(
          (a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()
        );
        return {
          ...prev,
          data: newData,
        };
      });

      return result.data.class;
    },
    []
  );

  const updateClass = useCallback(
    async (input: UpdateClassInput): Promise<Class> => {
      const functions = getMapleFunctions();
      const update = httpsCallable<UpdateClassRequest, UpdateClassResponse>(
        functions,
        'updateClass'
      );

      const result = await update(input);

      // Update the class in state and re-sort
      setClassesState((prev) => {
        if (prev.status !== 'success') return prev;
        const newData = prev.data
          .map((c) => (c.id === result.data.class.id ? result.data.class : c))
          .sort(
            (a, b) =>
              new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()
          );
        return {
          ...prev,
          data: newData,
        };
      });

      return result.data.class;
    },
    []
  );

  const deleteClass = useCallback(async (id: string): Promise<void> => {
    const functions = getMapleFunctions();
    const del = httpsCallable<DeleteClassRequest, DeleteClassResponse>(
      functions,
      'deleteClass'
    );

    await del({ id });

    // Remove the class from state
    setClassesState((prev) => {
      if (prev.status !== 'success') return prev;
      return {
        ...prev,
        data: prev.data.filter((c) => c.id !== id),
      };
    });
  }, []);

  // Fetch classes on mount and when filters change
  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  return {
    classesState,
    fetchClasses,
    createClass,
    updateClass,
    deleteClass,
  };
}
