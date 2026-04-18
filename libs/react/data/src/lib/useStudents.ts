'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  Student,
  CreateStudentInput,
  UpdateStudentInput,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetStudentsRequest,
  GetStudentsResponse,
  CreateStudentRequest,
  CreateStudentResponse,
  UpdateStudentRequest,
  UpdateStudentResponse,
  DeleteStudentRequest,
  DeleteStudentResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Hook for managing music lesson student CRUD operations.
 *
 * Provides state + API calls for the admin student management page.
 * Mirrors useInstructors's shape.
 */
export function useStudents() {
  const [studentsState, setStudentsState] = useState<RequestState<Student[]>>({
    status: 'idle',
  });

  const fetchStudents = useCallback(async () => {
    setStudentsState({ status: 'loading' });

    try {
      const functions = getMapleFunctions();
      const getStudents = httpsCallable<
        GetStudentsRequest,
        GetStudentsResponse
      >(functions, 'getStudents');

      const result = await getStudents({});
      setStudentsState({
        status: 'success',
        data: result.data.students,
      });
    } catch (error) {
      console.error('Failed to fetch students:', error);
      setStudentsState({
        status: 'error',
        error:
          error instanceof Error ? error.message : 'Failed to fetch students',
      });
    }
  }, []);

  const createStudent = useCallback(
    async (input: CreateStudentInput): Promise<Student> => {
      const functions = getMapleFunctions();
      const create = httpsCallable<
        CreateStudentRequest,
        CreateStudentResponse
      >(functions, 'createStudent');

      const result = await create(input);

      setStudentsState((prev) => {
        if (prev.status !== 'success') return prev;
        const newData = [...prev.data, result.data.student].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
        return { ...prev, data: newData };
      });

      return result.data.student;
    },
    []
  );

  const updateStudent = useCallback(
    async (input: UpdateStudentInput): Promise<Student> => {
      const functions = getMapleFunctions();
      const update = httpsCallable<
        UpdateStudentRequest,
        UpdateStudentResponse
      >(functions, 'updateStudent');

      const result = await update(input);

      setStudentsState((prev) => {
        if (prev.status !== 'success') return prev;
        const newData = prev.data
          .map((s) =>
            s.id === result.data.student.id ? result.data.student : s
          )
          .sort((a, b) => a.name.localeCompare(b.name));
        return { ...prev, data: newData };
      });

      return result.data.student;
    },
    []
  );

  const deleteStudent = useCallback(async (id: string): Promise<void> => {
    const functions = getMapleFunctions();
    const del = httpsCallable<DeleteStudentRequest, DeleteStudentResponse>(
      functions,
      'deleteStudent'
    );

    await del({ id });

    setStudentsState((prev) => {
      if (prev.status !== 'success') return prev;
      return { ...prev, data: prev.data.filter((s) => s.id !== id) };
    });
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  return {
    studentsState,
    fetchStudents,
    createStudent,
    updateStudent,
    deleteStudent,
  };
}
