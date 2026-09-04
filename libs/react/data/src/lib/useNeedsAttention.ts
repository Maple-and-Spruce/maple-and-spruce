'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  NeedsAttentionGroup,
  NeedsAttentionRow,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetNeedsAttentionRequest,
  GetNeedsAttentionResponse,
  UpdateStudentRequest,
  UpdateStudentResponse,
} from '@maple/ts/firebase/api-types';

export interface NeedsAttentionData {
  groups: NeedsAttentionGroup[];
  total: number;
  scopedToSelf: boolean;
}

/**
 * The Needs Attention panel (#807).
 *
 * `resolving` is a set of row ids rather than a page-wide flag, so fixing one
 * row does not freeze the rest (the pattern from #805).
 */
export function useNeedsAttention(options: { autoFetch?: boolean } = {}) {
  const { autoFetch = true } = options;
  const [attentionState, setAttentionState] = useState<
    RequestState<NeedsAttentionData>
  >({ status: 'idle' });
  const [resolving, setResolving] = useState<Set<string>>(new Set());

  const fetchAttention = useCallback(async () => {
    setAttentionState({ status: 'loading' });
    try {
      const fn = httpsCallable<
        GetNeedsAttentionRequest,
        GetNeedsAttentionResponse
      >(getMapleFunctions(), 'getNeedsAttention');
      const result = await fn({});
      setAttentionState({
        status: 'success',
        data: {
          groups: result.data.groups ?? [],
          total: result.data.total ?? 0,
          scopedToSelf: result.data.scopedToSelf ?? false,
        },
      });
    } catch (error) {
      setAttentionState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Could not load what needs attention',
      });
    }
  }, []);

  /**
   * Fix an `inline` row. Only one kind qualifies today — turning on automatic
   * invoicing for a student, which is a single boolean.
   */
  const resolveRow = useCallback(
    async (row: NeedsAttentionRow): Promise<void> => {
      if (row.resolution !== 'inline') return;
      setResolving((prev) => new Set(prev).add(row.id));
      try {
        if (row.kind === 'student-autoinvoice-off') {
          const fn = httpsCallable<UpdateStudentRequest, UpdateStudentResponse>(
            getMapleFunctions(),
            'updateStudent'
          );
          await fn({ id: row.id, autoInvoice: true });
        }
        await fetchAttention();
      } finally {
        setResolving((prev) => {
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
      }
    },
    [fetchAttention]
  );

  useEffect(() => {
    if (autoFetch) fetchAttention();
  }, [autoFetch, fetchAttention]);

  return { attentionState, fetchAttention, resolveRow, resolving };
}
