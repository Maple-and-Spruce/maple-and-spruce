'use client';

/**
 * Billing rules and scheduled charges (#81).
 *
 * One read serves both, because a charge is unreadable without the rule that
 * produced it — that is why `getLessonBilling` returns them together.
 */
import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  LessonBillingRule,
  LessonRateByLength,
  LessonScheduledCharge,
  RequestState,
} from '@maple/ts/domain';
import type {
  ChargeLessonsNowRequest,
  ChargeLessonsNowResponse,
  GetLessonBillingRequest,
  GetLessonBillingResponse,
  UpdateLessonScheduledChargeRequest,
  UpdateLessonScheduledChargeResponse,
} from '@maple/ts/firebase/api-types';

export interface LessonBillingData {
  rules: LessonBillingRule[];
  charges: LessonScheduledCharge[];
  /** The studio rate table, so a prepayment can be priced before it is taken. */
  rateByLength: LessonRateByLength;
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
          rateByLength: result.data.rateByLength ?? {},
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

  /**
   * Take money now, for a block of lessons a family is paying ahead for (legacy #864).
   *
   * Resolves to the error message when it is refused, and null when the money
   * moved — the caller needs to know which, because a declined card is
   * something to say to the family standing there, not a toast to dismiss.
   *
   * `amountCents` is sent back as `expectedAmountCents`: if the server prices
   * those lessons differently it refuses rather than charging an amount nobody
   * agreed to.
   */
  const chargeNow = useCallback(
    async (input: {
      studentId: string;
      lessonIds?: string[];
      lessonCount?: number;
      amountCents?: number;
      note?: string;
      retryChargeId?: string;
    }): Promise<string | null> => {
      setPendingId(input.retryChargeId ?? input.studentId);
      setActionError(null);
      try {
        const fn = httpsCallable<
          ChargeLessonsNowRequest,
          ChargeLessonsNowResponse
        >(getMapleFunctions(), 'chargeLessonsNow');
        await fn({
          studentId: input.studentId,
          lessonIds: input.lessonIds,
          lessonCount: input.lessonCount,
          expectedAmountCents: input.amountCents,
          note: input.note,
          retryChargeId: input.retryChargeId,
        });
        await fetchBilling();
        return null;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not take that payment';
        setActionError(message);
        return message;
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
    chargeNow,
    refetch: fetchBilling,
  };
}
