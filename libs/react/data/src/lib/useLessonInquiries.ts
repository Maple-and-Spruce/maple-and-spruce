'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  LessonInquiry,
  LessonInquiryStatus,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetLessonInquiriesRequest,
  GetLessonInquiriesResponse,
  UpdateLessonInquiryStatusRequest,
  UpdateLessonInquiryStatusResponse,
} from '@maple/ts/firebase/api-types';

/** Callables serialise Dates to ISO strings; bring them back. */
function hydrate(inquiry: LessonInquiry): LessonInquiry {
  return {
    ...inquiry,
    submittedAt: new Date(inquiry.submittedAt),
    createdAt: new Date(inquiry.createdAt),
    updatedAt: new Date(inquiry.updatedAt),
  };
}

/** Newest first — the queue is worked from the top. */
function byNewest(a: LessonInquiry, b: LessonInquiry): number {
  return b.submittedAt.getTime() - a.submittedAt.getTime();
}

export interface UseLessonInquiriesOptions {
  status?: LessonInquiryStatus;
  autoFetch?: boolean;
}

/**
 * Lesson inquiries for the `/leads` queue (#795).
 *
 * `updatingId` is per-record rather than a single page-wide boolean, so
 * advancing one lead does not freeze every other row. That is the same defect
 * #805 is fixing on the lesson surfaces; no reason to reintroduce it here.
 */
export function useLessonInquiries(options: UseLessonInquiriesOptions = {}) {
  const { status, autoFetch = true } = options;
  const [inquiriesState, setInquiriesState] = useState<
    RequestState<LessonInquiry[]>
  >({ status: 'idle' });
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchInquiries = useCallback(async () => {
    setInquiriesState({ status: 'loading' });
    try {
      const functions = getMapleFunctions();
      const get = httpsCallable<
        GetLessonInquiriesRequest,
        GetLessonInquiriesResponse
      >(functions, 'getLessonInquiries');

      const result = await get(status ? { status } : {});
      setInquiriesState({
        status: 'success',
        data: (result.data.inquiries ?? []).map(hydrate).sort(byNewest),
      });
    } catch (error) {
      setInquiriesState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Could not load lesson inquiries',
      });
    }
  }, [status]);

  const updateStatus = useCallback(
    async (
      id: string,
      nextStatus: LessonInquiryStatus,
      extra: { studentId?: string; followUpNote?: string } = {}
    ): Promise<LessonInquiry> => {
      setUpdatingId(id);
      try {
        const functions = getMapleFunctions();
        const update = httpsCallable<
          UpdateLessonInquiryStatusRequest,
          UpdateLessonInquiryStatusResponse
        >(functions, 'updateLessonInquiryStatus');

        const result = await update({ id, status: nextStatus, ...extra });
        const inquiry = hydrate(result.data.inquiry);

        setInquiriesState((prev) => {
          if (prev.status !== 'success') return prev;
          // When the list is filtered to one status, a record that no longer
          // matches leaves the view rather than lingering as a stale row.
          const next = status
            ? prev.data.filter((i) => i.id !== id)
            : prev.data.map((i) => (i.id === id ? inquiry : i));
          return { ...prev, data: next.sort(byNewest) };
        });

        return inquiry;
      } finally {
        setUpdatingId(null);
      }
    },
    [status]
  );

  useEffect(() => {
    if (autoFetch) fetchInquiries();
  }, [autoFetch, fetchInquiries]);

  return { inquiriesState, fetchInquiries, updateStatus, updatingId };
}
