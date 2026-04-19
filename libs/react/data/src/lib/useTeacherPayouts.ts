'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type { RequestState, TeacherPayout } from '@maple/ts/domain';
import type {
  GetTeacherPayoutsRequest,
  GetTeacherPayoutsResponse,
} from '@maple/ts/firebase/api-types';

export interface UseTeacherPayoutsOptions {
  /** Inclusive start of the period. */
  from: Date;
  /** Inclusive end of the period. */
  to: Date;
  /** Optional — limit results to a single teacher. */
  teacherId?: string;
  /** Autofetch whenever the period or teacher filter changes. Defaults true. */
  autoFetch?: boolean;
}

/**
 * Rehydrate date fields on each payout line — they arrive as ISO
 * strings over the wire.
 */
function hydratePayout(payout: TeacherPayout): TeacherPayout {
  return {
    ...payout,
    lines: payout.lines.map((line) => ({
      ...line,
      scheduledAt: new Date(line.scheduledAt),
    })),
  };
}

/**
 * Hook for the teacher payouts report. Re-fetches whenever the inputs
 * change. Pass stable Date instances (useMemo them if coming from
 * local state).
 */
export function useTeacherPayouts({
  from,
  to,
  teacherId,
  autoFetch = true,
}: UseTeacherPayoutsOptions) {
  const [payoutsState, setPayoutsState] = useState<
    RequestState<TeacherPayout[]>
  >({ status: 'idle' });

  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const fetchPayouts = useCallback(async () => {
    setPayoutsState({ status: 'loading' });
    try {
      const functions = getMapleFunctions();
      const get = httpsCallable<
        GetTeacherPayoutsRequest,
        GetTeacherPayoutsResponse
      >(functions, 'getTeacherPayouts');

      const result = await get({ from: fromIso, to: toIso, teacherId });
      setPayoutsState({
        status: 'success',
        data: result.data.payouts.map(hydratePayout),
      });
    } catch (error) {
      console.error('Failed to fetch teacher payouts:', error);
      setPayoutsState({
        status: 'error',
        error:
          error instanceof Error ? error.message : 'Failed to fetch payouts',
      });
    }
  }, [fromIso, toIso, teacherId]);

  useEffect(() => {
    if (autoFetch) {
      fetchPayouts();
    }
  }, [autoFetch, fetchPayouts]);

  return { payoutsState, fetchPayouts };
}
