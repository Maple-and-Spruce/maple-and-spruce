'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallableFromURL } from 'firebase/functions';
import {
  getMapleFunctions,
  routerCallableUrl,
} from '@maple/ts/firebase/firebase-config';
import type {
  HopeQueueEntry,
  HopeQueueTotals,
  HopeSubmissionStatus,
  RequestState,
  SaveHopeOrderInput,
} from '@maple/ts/domain';
import type {
  GetHopeQueueRequest,
  GetHopeQueueResponse,
  HopeOrderWithRoom,
  RecordHopeSubmissionsRequest,
  RecordHopeSubmissionsResponse,
  SaveHopeOrderRequest,
  SaveHopeOrderResponse,
} from '@maple/ts/firebase/api-types';

export interface HopeQueueData {
  entries: HopeQueueEntry[];
  totals: HopeQueueTotals;
  orders: HopeOrderWithRoom[];
}

function hydrateOrder(order: HopeOrderWithRoom): HopeOrderWithRoom {
  return {
    ...order,
    orderedOn: new Date(order.orderedOn),
    createdAt: new Date(order.createdAt),
    updatedAt: new Date(order.updatedAt),
  };
}

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
 * The Hope submission queue (legacy #799).
 *
 * `recording` is the set of lesson ids currently being written, so a bulk
 * action shows progress on exactly the rows it touches rather than freezing the
 * page (the pattern established in legacy #805).
 */
export function useHopeQueue(options: UseHopeQueueOptions = {}) {
  const { studentId, autoFetch = true } = options;
  const [queueState, setQueueState] = useState<RequestState<HopeQueueData>>({
    status: 'idle',
  });
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [recording, setRecording] = useState<Set<string>>(new Set());

  const fetchQueue = useCallback(async () => {
    setQueueState({ status: 'loading' });
    try {
      const fn = httpsCallableFromURL<GetHopeQueueRequest, GetHopeQueueResponse>(
        getMapleFunctions(),
        routerCallableUrl('hope', 'getHopeQueue')
      );
      const result = await fn(studentId ? { studentId } : {});
      setQueueState({
        status: 'success',
        data: {
          entries: (result.data.entries ?? []).map(hydrate),
          totals: result.data.totals,
          orders: (result.data.orders ?? []).map(hydrateOrder),
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
        const fn = httpsCallableFromURL<
          RecordHopeSubmissionsRequest,
          RecordHopeSubmissionsResponse
        >(getMapleFunctions(), routerCallableUrl('hope', 'recordHopeSubmissions'));
        const result = await fn({ lessonIds, status, ...extra });
        await fetchQueue();
        return result.data;
      } finally {
        setRecording(new Set());
      }
    },
    [fetchQueue]
  );

  /**
   * Record (or correct) an EMA order. Refetches the queue, because a new order
   * turns lessons that needed one into lessons ready to invoice.
   */
  const saveOrder = useCallback(
    async (input: SaveHopeOrderInput) => {
      setIsSavingOrder(true);
      try {
        const fn = httpsCallableFromURL<
          SaveHopeOrderRequest,
          SaveHopeOrderResponse
        >(getMapleFunctions(), routerCallableUrl('hope', 'saveHopeOrder'));
        const result = await fn(input);
        await fetchQueue();
        return result.data.order;
      } finally {
        setIsSavingOrder(false);
      }
    },
    [fetchQueue]
  );

  useEffect(() => {
    if (autoFetch) fetchQueue();
  }, [autoFetch, fetchQueue]);

  return {
    queueState,
    fetchQueue,
    recordSubmissions,
    recording,
    saveOrder,
    isSavingOrder,
  };
}
