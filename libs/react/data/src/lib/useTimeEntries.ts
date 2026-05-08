'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  TimeEntry,
  TimeEntryStatus,
  CreateTimeEntryInput,
  UpdateTimeEntryInput,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetTimeEntriesRequest,
  GetTimeEntriesResponse,
  CreateTimeEntryRequest,
  CreateTimeEntryResponse,
  UpdateTimeEntryRequest,
  UpdateTimeEntryResponse,
  DeleteTimeEntryRequest,
  DeleteTimeEntryResponse,
  MarkTimeEntriesPaidRequest,
  MarkTimeEntriesPaidResponse,
} from '@maple/ts/firebase/api-types';

export interface UseTimeEntriesOptions {
  employeeId?: string;
  status?: TimeEntryStatus;
  startDate?: string;
  endDate?: string;
}

export function useTimeEntries(options?: UseTimeEntriesOptions) {
  const [entriesState, setEntriesState] = useState<RequestState<TimeEntry[]>>({
    status: 'idle',
  });

  // Stable serialization so the effect re-runs only when filters change
  const optionsKey = useMemo(
    () =>
      JSON.stringify({
        employeeId: options?.employeeId ?? null,
        status: options?.status ?? null,
        startDate: options?.startDate ?? null,
        endDate: options?.endDate ?? null,
      }),
    [
      options?.employeeId,
      options?.status,
      options?.startDate,
      options?.endDate,
    ]
  );

  const fetchEntries = useCallback(async () => {
    setEntriesState({ status: 'loading' });
    try {
      const fn = httpsCallable<
        GetTimeEntriesRequest,
        GetTimeEntriesResponse
      >(getMapleFunctions(), 'getTimeEntries');
      const result = await fn(JSON.parse(optionsKey));
      setEntriesState({ status: 'success', data: result.data.entries });
    } catch (error) {
      console.error('Failed to fetch time entries:', error);
      setEntriesState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch time entries',
      });
    }
  }, [optionsKey]);

  const createEntry = useCallback(
    async (input: CreateTimeEntryInput): Promise<TimeEntry> => {
      const fn = httpsCallable<
        CreateTimeEntryRequest,
        CreateTimeEntryResponse
      >(getMapleFunctions(), 'createTimeEntry');
      const result = await fn(input);
      setEntriesState((prev) =>
        prev.status === 'success'
          ? { ...prev, data: [result.data.entry, ...prev.data] }
          : prev
      );
      return result.data.entry;
    },
    []
  );

  const updateEntry = useCallback(
    async (input: UpdateTimeEntryInput): Promise<TimeEntry> => {
      const fn = httpsCallable<
        UpdateTimeEntryRequest,
        UpdateTimeEntryResponse
      >(getMapleFunctions(), 'updateTimeEntry');
      const result = await fn(input);
      setEntriesState((prev) =>
        prev.status === 'success'
          ? {
              ...prev,
              data: prev.data.map((e) =>
                e.id === result.data.entry.id ? result.data.entry : e
              ),
            }
          : prev
      );
      return result.data.entry;
    },
    []
  );

  const deleteEntry = useCallback(async (id: string): Promise<void> => {
    const fn = httpsCallable<
      DeleteTimeEntryRequest,
      DeleteTimeEntryResponse
    >(getMapleFunctions(), 'deleteTimeEntry');
    await fn({ id });
    setEntriesState((prev) =>
      prev.status === 'success'
        ? { ...prev, data: prev.data.filter((e) => e.id !== id) }
        : prev
    );
  }, []);

  const markPaid = useCallback(
    async (ids: string[]): Promise<MarkTimeEntriesPaidResponse> => {
      const fn = httpsCallable<
        MarkTimeEntriesPaidRequest,
        MarkTimeEntriesPaidResponse
      >(getMapleFunctions(), 'markTimeEntriesPaid');
      const result = await fn({ ids });
      // Refetch to pick up status / paidAt / paidBy updates
      await fetchEntries();
      return result.data;
    },
    [fetchEntries]
  );

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  return {
    entriesState,
    fetchEntries,
    createEntry,
    updateEntry,
    deleteEntry,
    markPaid,
  };
}
