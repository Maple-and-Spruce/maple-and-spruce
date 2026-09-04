'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type { ManualInvoicePaymentSource, RequestState } from '@maple/ts/domain';
import type {
  GetMyDayLessonsRequest,
  GetMyDayLessonsResponse,
  RecordInvoicePaymentRequest,
  RecordInvoicePaymentResponse,
  UpdateLessonRequest,
  UpdateLessonResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Hook for the teacher "My Day" page (#631): the signed-in teacher's lessons
 * for today, plus the two attest actions — mark a lesson rendered (which
 * auto-invoices #629) and record a Venmo/manual payment on its invoice. Both
 * are ownership-checked server-side.
 */
export function useMyDay() {
  const [dayState, setDayState] = useState<
    RequestState<GetMyDayLessonsResponse>
  >({ status: 'idle' });

  const fetchDay = useCallback(async () => {
    setDayState({ status: 'loading' });
    try {
      // "Today" in the teacher's own timezone (the browser's).
      const now = new Date();
      const from = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      ).toISOString();
      const to = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        23,
        59,
        59,
        999
      ).toISOString();

      const fn = httpsCallable<
        GetMyDayLessonsRequest,
        GetMyDayLessonsResponse
      >(getMapleFunctions(), 'getMyDayLessons');
      const result = await fn({ from, to });
      setDayState({ status: 'success', data: result.data });
    } catch (error) {
      console.error('Failed to fetch My Day:', error);
      setDayState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to fetch',
      });
    }
  }, []);

  const markRendered = useCallback(
    async (lessonId: string): Promise<void> => {
      const fn = httpsCallable<UpdateLessonRequest, UpdateLessonResponse>(
        getMapleFunctions(),
        'updateLesson'
      );
      await fn({ id: lessonId, status: 'rendered' });
      await fetchDay();
    },
    [fetchDay]
  );

  const markNoShow = useCallback(
    async (lessonId: string): Promise<void> => {
      const fn = httpsCallable<UpdateLessonRequest, UpdateLessonResponse>(
        getMapleFunctions(),
        'updateLesson'
      );
      await fn({ id: lessonId, status: 'no-show' });
      await fetchDay();
    },
    [fetchDay]
  );

  const recordPayment = useCallback(
    async (
      invoiceId: string,
      source: ManualInvoicePaymentSource
    ): Promise<void> => {
      const fn = httpsCallable<
        RecordInvoicePaymentRequest,
        RecordInvoicePaymentResponse
      >(getMapleFunctions(), 'recordInvoicePayment');
      await fn({ id: invoiceId, source });
      await fetchDay();
    },
    [fetchDay]
  );

  useEffect(() => {
    fetchDay();
  }, [fetchDay]);

  return { dayState, fetchDay, markRendered, markNoShow, recordPayment };
}
