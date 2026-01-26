'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  Instructor,
  CreateInstructorInput,
  UpdateInstructorInput,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetInstructorsRequest,
  GetInstructorsResponse,
  CreateInstructorRequest,
  CreateInstructorResponse,
  UpdateInstructorRequest,
  UpdateInstructorResponse,
  DeleteInstructorRequest,
  DeleteInstructorResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Hook for managing instructor CRUD operations
 *
 * Provides state management and API calls for the instructor management system.
 */
export function useInstructors() {
  const [instructorsState, setInstructorsState] = useState<
    RequestState<Instructor[]>
  >({
    status: 'idle',
  });

  const fetchInstructors = useCallback(async () => {
    setInstructorsState({ status: 'loading' });

    try {
      const functions = getMapleFunctions();
      const getInstructors = httpsCallable<
        GetInstructorsRequest,
        GetInstructorsResponse
      >(functions, 'getInstructors');

      const result = await getInstructors({});
      setInstructorsState({
        status: 'success',
        data: result.data.instructors,
      });
    } catch (error) {
      console.error('Failed to fetch instructors:', error);
      setInstructorsState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch instructors',
      });
    }
  }, []);

  const createInstructor = useCallback(
    async (input: CreateInstructorInput): Promise<Instructor> => {
      const functions = getMapleFunctions();
      const create = httpsCallable<
        CreateInstructorRequest,
        CreateInstructorResponse
      >(functions, 'createInstructor');

      const result = await create(input);

      // Add the new instructor to state
      setInstructorsState((prev) => {
        if (prev.status !== 'success') return prev;
        // Sort by name after adding
        const newData = [...prev.data, result.data.instructor].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
        return {
          ...prev,
          data: newData,
        };
      });

      return result.data.instructor;
    },
    []
  );

  const updateInstructor = useCallback(
    async (input: UpdateInstructorInput): Promise<Instructor> => {
      const functions = getMapleFunctions();
      const update = httpsCallable<
        UpdateInstructorRequest,
        UpdateInstructorResponse
      >(functions, 'updateInstructor');

      const result = await update(input);

      // Update the instructor in state and re-sort
      setInstructorsState((prev) => {
        if (prev.status !== 'success') return prev;
        const newData = prev.data
          .map((i) =>
            i.id === result.data.instructor.id ? result.data.instructor : i
          )
          .sort((a, b) => a.name.localeCompare(b.name));
        return {
          ...prev,
          data: newData,
        };
      });

      return result.data.instructor;
    },
    []
  );

  const deleteInstructor = useCallback(async (id: string): Promise<void> => {
    const functions = getMapleFunctions();
    const del = httpsCallable<DeleteInstructorRequest, DeleteInstructorResponse>(
      functions,
      'deleteInstructor'
    );

    await del({ id });

    // Remove the instructor from state
    setInstructorsState((prev) => {
      if (prev.status !== 'success') return prev;
      return {
        ...prev,
        data: prev.data.filter((i) => i.id !== id),
      };
    });
  }, []);

  // Fetch instructors on mount
  useEffect(() => {
    fetchInstructors();
  }, [fetchInstructors]);

  return {
    instructorsState,
    fetchInstructors,
    createInstructor,
    updateInstructor,
    deleteInstructor,
  };
}
