'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import { callDeduped } from './call-deduped';
import {
  mtSemesterSortValue,
  type MusicTogetherSemester,
  type CreateMusicTogetherSemesterInput,
  type UpdateMusicTogetherSemesterInput,
  type RequestState,
} from '@maple/ts/domain';
import type {
  GetMusicTogetherSemestersRequest,
  GetMusicTogetherSemestersResponse,
  CreateMusicTogetherSemesterRequest,
  CreateMusicTogetherSemesterResponse,
  UpdateMusicTogetherSemesterRequest,
  UpdateMusicTogetherSemesterResponse,
} from '@maple/ts/firebase/api-types';

/** Hydrate ISO date strings (callable serialization) back into Dates. */
function hydrateSemester(
  semester: MusicTogetherSemester
): MusicTogetherSemester {
  return {
    ...semester,
    startDate: semester.startDate ? new Date(semester.startDate) : undefined,
    endDate: semester.endDate ? new Date(semester.endDate) : undefined,
    enrollmentOpensAt: semester.enrollmentOpensAt
      ? new Date(semester.enrollmentOpensAt)
      : undefined,
    breaks: semester.breaks?.map((b) => ({
      label: b.label,
      startDate: new Date(b.startDate),
      endDate: new Date(b.endDate),
    })),
    weatherMakeupDates: semester.weatherMakeupDates?.map((d) => new Date(d)),
    createdAt: new Date(semester.createdAt),
    updatedAt: new Date(semester.updatedAt),
  };
}

function bySortValue(a: MusicTogetherSemester, b: MusicTogetherSemester): number {
  return mtSemesterSortValue(a) - mtSemesterSortValue(b);
}

/**
 * Hook for managing Music Together semester CRUD in the admin app.
 */
export function useMusicTogetherSemesters() {
  const [semestersState, setSemestersState] = useState<
    RequestState<MusicTogetherSemester[]>
  >({ status: 'idle' });

  const fetchSemesters = useCallback(async () => {
    setSemestersState({ status: 'loading' });
    try {
      const result = await callDeduped<
        GetMusicTogetherSemestersRequest,
        GetMusicTogetherSemestersResponse
      >('getMusicTogetherSemesters', {});
      setSemestersState({
        status: 'success',
        data: result.data.semesters.map(hydrateSemester).sort(bySortValue),
      });
    } catch (error) {
      console.error('Failed to fetch Music Together semesters:', error);
      setSemestersState({
        status: 'error',
        error:
          error instanceof Error ? error.message : 'Failed to fetch semesters',
      });
    }
  }, []);

  const createSemester = useCallback(
    async (
      input: CreateMusicTogetherSemesterInput
    ): Promise<MusicTogetherSemester> => {
      const functions = getMapleFunctions();
      const create = httpsCallable<
        CreateMusicTogetherSemesterRequest,
        CreateMusicTogetherSemesterResponse
      >(functions, 'createMusicTogetherSemester');
      const result = await create(input);
      const semester = hydrateSemester(result.data.semester);
      setSemestersState((prev) => {
        if (prev.status !== 'success') return prev;
        return { ...prev, data: [...prev.data, semester].sort(bySortValue) };
      });
      return semester;
    },
    []
  );

  const updateSemester = useCallback(
    async (
      input: UpdateMusicTogetherSemesterInput
    ): Promise<MusicTogetherSemester> => {
      const functions = getMapleFunctions();
      const update = httpsCallable<
        UpdateMusicTogetherSemesterRequest,
        UpdateMusicTogetherSemesterResponse
      >(functions, 'updateMusicTogetherSemester');
      const result = await update(input);
      const semester = hydrateSemester(result.data.semester);
      setSemestersState((prev) => {
        if (prev.status !== 'success') return prev;
        return {
          ...prev,
          data: prev.data
            .map((s) => (s.id === semester.id ? semester : s))
            .sort(bySortValue),
        };
      });
      return semester;
    },
    []
  );

  useEffect(() => {
    fetchSemesters();
  }, [fetchSemesters]);

  return { semestersState, fetchSemesters, createSemester, updateSemester };
}
