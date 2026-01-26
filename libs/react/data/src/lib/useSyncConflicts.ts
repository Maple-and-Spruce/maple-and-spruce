'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  SyncConflict,
  SyncConflictSummary,
  SyncResolution,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetSyncConflictsRequest,
  GetSyncConflictsResponse,
  GetSyncConflictSummaryRequest,
  GetSyncConflictSummaryResponse,
  ResolveSyncConflictRequest,
  ResolveSyncConflictResponse,
  DetectSyncConflictsRequest,
  DetectSyncConflictsResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Hook for managing sync conflict detection and resolution
 *
 * Provides state management and API calls for the sync conflict system.
 *
 * @see ADR-012 for sync conflict detection and resolution strategy
 */
export function useSyncConflicts() {
  const [conflictsState, setConflictsState] = useState<
    RequestState<SyncConflict[]>
  >({
    status: 'idle',
  });

  const [summaryState, setSummaryState] = useState<
    RequestState<SyncConflictSummary>
  >({
    status: 'idle',
  });

  const [detectingState, setDetectingState] = useState<RequestState<{
    detected: number;
    updated: number;
  }>>({
    status: 'idle',
  });

  /**
   * Fetch all sync conflicts, optionally filtered
   */
  const fetchConflicts = useCallback(
    async (filters?: GetSyncConflictsRequest) => {
      setConflictsState({ status: 'loading' });

      try {
        const functions = getMapleFunctions();
        const getSyncConflicts = httpsCallable<
          GetSyncConflictsRequest,
          GetSyncConflictsResponse
        >(functions, 'getSyncConflicts');

        const result = await getSyncConflicts(filters ?? {});
        setConflictsState({
          status: 'success',
          data: result.data.conflicts,
        });
      } catch (error) {
        console.error('Failed to fetch sync conflicts:', error);
        setConflictsState({
          status: 'error',
          error:
            error instanceof Error
              ? error.message
              : 'Failed to fetch sync conflicts',
        });
      }
    },
    []
  );

  /**
   * Fetch summary of sync conflicts (for nav badge)
   */
  const fetchSummary = useCallback(async () => {
    setSummaryState({ status: 'loading' });

    try {
      const functions = getMapleFunctions();
      const getSyncConflictSummary = httpsCallable<
        GetSyncConflictSummaryRequest,
        GetSyncConflictSummaryResponse
      >(functions, 'getSyncConflictSummary');

      const result = await getSyncConflictSummary({});
      setSummaryState({
        status: 'success',
        data: result.data.summary,
      });
    } catch (error) {
      console.error('Failed to fetch sync conflict summary:', error);
      setSummaryState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch sync conflict summary',
      });
    }
  }, []);

  /**
   * Resolve a sync conflict
   */
  const resolveConflict = useCallback(
    async (
      conflictId: string,
      resolution: SyncResolution,
      notes?: string
    ): Promise<SyncConflict> => {
      const functions = getMapleFunctions();
      const resolveSyncConflict = httpsCallable<
        ResolveSyncConflictRequest,
        ResolveSyncConflictResponse
      >(functions, 'resolveSyncConflict');

      const result = await resolveSyncConflict({
        conflictId,
        resolution,
        notes,
      });

      // Update the conflict in state (change from pending to resolved)
      setConflictsState((prev) => {
        if (prev.status !== 'success') return prev;
        return {
          ...prev,
          data: prev.data.map((c) =>
            c.id === result.data.conflict.id ? result.data.conflict : c
          ),
        };
      });

      // Refresh summary since counts changed
      fetchSummary();

      return result.data.conflict;
    },
    [fetchSummary]
  );

  /**
   * Detect sync conflicts (manual trigger)
   */
  const detectConflicts = useCallback(
    async (
      options?: DetectSyncConflictsRequest
    ): Promise<{ detected: number; updated: number }> => {
      setDetectingState({ status: 'loading' });

      try {
        const functions = getMapleFunctions();
        const detectSyncConflicts = httpsCallable<
          DetectSyncConflictsRequest,
          DetectSyncConflictsResponse
        >(functions, 'detectSyncConflicts');

        const result = await detectSyncConflicts(options ?? {});

        setDetectingState({
          status: 'success',
          data: {
            detected: result.data.detected,
            updated: result.data.updated,
          },
        });

        // Update conflicts state with the returned conflicts
        setConflictsState({
          status: 'success',
          data: result.data.conflicts,
        });

        // Refresh summary since counts changed
        fetchSummary();

        return {
          detected: result.data.detected,
          updated: result.data.updated,
        };
      } catch (error) {
        console.error('Failed to detect sync conflicts:', error);
        setDetectingState({
          status: 'error',
          error:
            error instanceof Error
              ? error.message
              : 'Failed to detect sync conflicts',
        });
        throw error;
      }
    },
    [fetchSummary]
  );

  // Fetch conflicts and summary on mount
  useEffect(() => {
    fetchConflicts();
    fetchSummary();
  }, [fetchConflicts, fetchSummary]);

  return {
    conflictsState,
    summaryState,
    detectingState,
    fetchConflicts,
    fetchSummary,
    resolveConflict,
    detectConflicts,
  };
}
