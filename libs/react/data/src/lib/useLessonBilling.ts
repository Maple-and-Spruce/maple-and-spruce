'use client';

/**
 * Billing rules and scheduled charges (#798).
 *
 * One read serves both, because a charge is unreadable without the rule that
 * produced it — that is why `getLessonBilling` returns them together.
 */
import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  LessonBillingRule,
  LessonScheduledCharge,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetLessonBillingRequest,
  GetLessonBillingResponse,
  UpdateLessonScheduledChargeRequest,
  UpdateLessonScheduledChargeResponse,
} from '@maple/ts/firebase/api-types';

export interface LessonBillingData {
  rules: LessonBillingRule[];
  charges: LessonScheduledCharge[];
}

function hydrate(charge: LessonScheduledCharge): LessonScheduledCharge {
  return {
    ...charge,
    dueAt: new Date(charge.dueAt),
    createdAt: new Date(charge.createdAt),
    updatedAt: new Date(charge.updatedAt),
    resolvedAt: charge.resolvedAt ? new Date(charge.resolvedAt) : undefined,
  };
}

export function useLessonBilling(studentId?: string) {
  const [billingState, setBillingState] = useState<
    RequestState<LessonBillingData>
  >({ status: 'idle' });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchBilling = useCallback(async () => {
    setBillingState({ status: 'loading' });
    try {
      const fn = httpsCallable<
        GetLessonBillingRequest,
        GetLessonBillingResponse
      >(getMapleFunctions(), 'getLessonBilling');
      const result = await fn(studentId ? { studentId } : {});
      setBillingState({
        status: 'success',
        data: {
          rules: result.data.rules ?? [],
          charges: (result.data.charges ?? []).map(hydrate),
        },
      });
    } catch (error) {
      setBillingState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Could not load the billing schedule',
      });
    }
  }, [studentId]);

  useEffect(() => {
    fetchBilling();
  }, [fetchBilling]);

  const stopCharge = useCallback(
    async (
      id: string,
      status: 'cancelled' | 'waived',
      waivedReason?: string
    ): Promise<void> => {
      setPendingId(id);
      setActionError(null);
      try {
        const fn = httpsCallable<
          UpdateLessonScheduledChargeRequest,
          UpdateLessonScheduledChargeResponse
        >(getMapleFunctions(), 'updateLessonScheduledCharge');
        await fn({ id, status, waivedReason });
        await fetchBilling();
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : 'Could not stop that charge'
        );
      } finally {
        setPendingId(null);
      }
    },
    [fetchBilling]
  );

  return {
    billingState,
    pendingId,
    actionError,
    stopCharge,
    refetch: fetchBilling,
  };
}
