'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  CreateStudentLessonScheduleInput,
  RequestState,
  StudentLessonSchedule,
} from '@maple/ts/domain';
import type {
  CreateStudentLessonScheduleRequest,
  CreateStudentLessonScheduleResponse,
  GetStudentLessonSchedulesRequest,
  GetStudentLessonSchedulesResponse,
  UpdateStudentLessonScheduleRequest,
  UpdateStudentLessonScheduleResponse,
} from '@maple/ts/firebase/api-types';

/** Callables serialise Dates to ISO strings; bring them back. */
function hydrate(s: StudentLessonSchedule): StudentLessonSchedule {
  return {
    ...s,
    startsOn: new Date(s.startsOn),
    endsOn: s.endsOn ? new Date(s.endsOn) : undefined,
    createdAt: new Date(s.createdAt),
    updatedAt: new Date(s.updatedAt),
  };
}

/**
 * A student's standing arrangements (legacy #797).
 *
 * `pendingId` is per-schedule, so saving one does not freeze the others — the
 * pattern from legacy #805.
 */
export function useStudentLessonSchedules(studentId?: string) {
  const [schedulesState, setSchedulesState] = useState<
    RequestState<StudentLessonSchedule[]>
  >({ status: 'idle' });
  const [pendingId, setPendingId] = useState<string | null>(null);

  const fetchSchedules = useCallback(async () => {
    if (!studentId) return;
    setSchedulesState({ status: 'loading' });
    try {
      const fn = httpsCallable<
        GetStudentLessonSchedulesRequest,
        GetStudentLessonSchedulesResponse
      >(getMapleFunctions(), 'getStudentLessonSchedules');
      const result = await fn({ studentId });
      setSchedulesState({
        status: 'success',
        data: (result.data.schedules ?? []).map(hydrate),
      });
    } catch (error) {
      setSchedulesState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Could not load the standing schedule',
      });
    }
  }, [studentId]);

  const createSchedule = useCallback(
    async (
      input: CreateStudentLessonScheduleInput
    ): Promise<{ lessonsCreated: number }> => {
      setPendingId('new');
      try {
        const fn = httpsCallable<
          CreateStudentLessonScheduleRequest,
          CreateStudentLessonScheduleResponse
        >(getMapleFunctions(), 'createStudentLessonSchedule');
        const result = await fn(input);
        await fetchSchedules();
        return { lessonsCreated: result.data.lessonsCreated ?? 0 };
      } finally {
        setPendingId(null);
      }
    },
    [fetchSchedules]
  );

  const updateSchedule = useCallback(
    async (input: UpdateStudentLessonScheduleRequest): Promise<void> => {
      setPendingId(input.id);
      try {
        const fn = httpsCallable<
          UpdateStudentLessonScheduleRequest,
          UpdateStudentLessonScheduleResponse
        >(getMapleFunctions(), 'updateStudentLessonSchedule');
        await fn(input);
        await fetchSchedules();
      } finally {
        setPendingId(null);
      }
    },
    [fetchSchedules]
  );

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  return {
    schedulesState,
    fetchSchedules,
    createSchedule,
    updateSchedule,
    pendingId,
  };
}

/**
 * Every standing arrangement, optionally scoped to one teacher.
 *
 * Separate from `useStudentLessonSchedules`, which is per-student and returns
 * early without one. The day column (legacy #838) needs the whole day rather than one
 * student's slice, and read-only — booking happens through the arrangement
 * hook on a student's page.
 */
export function useAllStudentLessonSchedules(teacherId?: string) {
  const [schedulesState, setSchedulesState] = useState<
    RequestState<StudentLessonSchedule[]>
  >({ status: 'idle' });

  const fetchSchedules = useCallback(async () => {
    setSchedulesState({ status: 'loading' });
    try {
      const fn = httpsCallable<
        GetStudentLessonSchedulesRequest,
        GetStudentLessonSchedulesResponse
      >(getMapleFunctions(), 'getStudentLessonSchedules');
      const result = await fn(teacherId ? { teacherId } : {});
      setSchedulesState({
        status: 'success',
        data: (result.data.schedules ?? []).map(hydrate),
      });
    } catch (error) {
      setSchedulesState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Could not load standing schedules',
      });
    }
  }, [teacherId]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  return { schedulesState, refetch: fetchSchedules };
}
