'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  HopeQueueEntry,
  HopeQueueTotals,
  HopeSubmissionStatus,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetHopeQueueRequest,
  GetHopeQueueResponse,
  RecordHopeSubmissionsRequest,
  RecordHopeSubmissionsResponse,
} from '@maple/ts/firebase/api-types';

/** Callables serialise Dates to ISO strings; bring them back. */
function hydrate(entry: HopeQueueEntry): HopeQueueEntry {
  return {
    ...entry,
    lesson: {
      ...entry.lesson,
      scheduledAt: new Date(entry.lesson.scheduledAt),
      createdAt: new Date(entry.lesson.createdAt),
      updatedAt: new Date(entry.lesson.updatedAt),
    },
    submission: entry.submission
      ? {
          ...entry.submission,
          lessonDate: new Date(entry.submission.lessonDate),
          submittedAt: new Date(entry.submission.submittedAt),
          paidAt: entry.submission.paidAt
            ? new Date(entry.submission.paidAt)
            : undefined,
          createdAt: new Date(entry.submission.createdAt),
          updatedAt: new Date(entry.submission.updatedAt),
        }
      : undefined,
  };
}

export interface UseHopeQueueOptions {
  studentId?: string;
  autoFetch?: boolean;
}

/**
 * The Hope submission queue (#799).
 *
 * `recording` is the set of lesson ids currently being written, so a bulk
 * action shows progress on exactly the rows it touches rather than freezing the
 * page (the pattern established in #805).
 */
export function useHopeQueue(options: UseHopeQueueOptions = {}) {
  const { studentId, autoFetch = true } = options;
  const [queueState, setQueueState] = useState<
    RequestState<{ entries: HopeQueueEntry[]; totals: HopeQueueTotals }>
  >({ status: 'idle' });
  const [recording, setRecording] = useState<Set<string>>(new Set());

  const fetchQueue = useCallback(async () => {
    setQueueState({ status: 'loading' });
    try {
      const fn = httpsCallable<GetHopeQueueRequest, GetHopeQueueResponse>(
        getMapleFunctions(),
        'getHopeQueue'
      );
      const result = await fn(studentId ? { studentId } : {});
      setQueueState({
        status: 'success',
        data: {
          entries: (result.data.entries ?? []).map(hydrate),
          totals: result.data.totals,
        },
      });
    } catch (error) {
      setQueueState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Could not load the Hope queue',
      });
    }
  }, [studentId]);

  const recordSubmissions = useCallback(
    async (
      lessonIds: string[],
      status: HopeSubmissionStatus,
      extra: { emaReference?: string; rejectionReason?: string } = {}
    ): Promise<RecordHopeSubmissionsResponse> => {
      setRecording(new Set(lessonIds));
      try {
        const fn = httpsCallable<
          RecordHopeSubmissionsRequest,
          RecordHopeSubmissionsResponse
        >(getMapleFunctions(), 'recordHopeSubmissions');
        const result = await fn({ lessonIds, status, ...extra });
        await fetchQueue();
        return result.data;
      } finally {
        setRecording(new Set());
      }
    },
    [fetchQueue]
  );

  useEffect(() => {
    if (autoFetch) fetchQueue();
  }, [autoFetch, fetchQueue]);

  return { queueState, fetchQueue, recordSubmissions, recording };
}
