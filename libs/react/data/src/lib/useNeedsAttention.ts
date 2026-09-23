'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  NeedsAttentionGroup,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetNeedsAttentionRequest,
  GetNeedsAttentionResponse,
} from '@maple/ts/firebase/api-types';

export interface NeedsAttentionData {
  groups: NeedsAttentionGroup[];
  total: number;
  scopedToSelf: boolean;
}

/**
 * The Needs Attention panel (legacy #807).
 *
 * Read-only: every row links to the record that needs the work. The panel used
 * to fix one kind itself — turning a student's automatic invoicing back on —
 * and that row disappeared when invoicing became explicit, taking the inline
 * plumbing with it.
 */
export function useNeedsAttention(options: { autoFetch?: boolean } = {}) {
  const { autoFetch = true } = options;
  const [attentionState, setAttentionState] = useState<
    RequestState<NeedsAttentionData>
  >({ status: 'idle' });

  const fetchAttention = useCallback(async () => {
    // Refresh behind the panel once it has loaded. Dropping back to `loading`
    // unmounts it, which re-folds a collapsed panel after every inline fix.
    setAttentionState((prev) =>
      prev.status === 'success' ? prev : { status: 'loading' }
    );
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

  useEffect(() => {
    if (autoFetch) fetchAttention();
  }, [autoFetch, fetchAttention]);

  return { attentionState, fetchAttention };
}
