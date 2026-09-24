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
  SaveLessonBillingRuleRequest,
  SaveLessonBillingRuleResponse,
  RunLessonBillingRequest,
  RunLessonBillingResult,
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

  /**
   * Create or edit a rule (#107).
   *
   * Resolves to the error message when the server refuses, and null when it
   * saved — a rule is a standing instruction to take money, so a refusal has to
   * reach the form rather than a toast that scrolls away.
   */
  const saveRule = useCallback(
    async (input: SaveLessonBillingRuleRequest): Promise<string | null> => {
      setPendingId(input.id ?? 'new-rule');
      setActionError(null);
      try {
        const fn = httpsCallable<
          SaveLessonBillingRuleRequest,
          SaveLessonBillingRuleResponse
        >(getMapleFunctions(), 'saveLessonBillingRule');
        await fn(input);
        await fetchBilling();
        return null;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not save that rule';
        setActionError(message);
        return message;
      } finally {
        setPendingId(null);
      }
    },
    [fetchBilling]
  );

  /**
   * Run the billing job now, or preview what it would do.
   *
   * `dryRun` reports the same counters and writes nothing, which is the only way
   * to find out what a rule will do without waiting for 09:00 and finding out by
   * charging somebody.
   */
  const runBilling = useCallback(
    async (opts: { dryRun: boolean }): Promise<RunLessonBillingResult | null> => {
      setPendingId(opts.dryRun ? 'preview-run' : 'billing-run');
      setActionError(null);
      try {
        const fn = httpsCallable<
          RunLessonBillingRequest,
          RunLessonBillingResult
        >(getMapleFunctions(), 'triggerLessonBilling');
        const result = await fn({ dryRun: opts.dryRun });
        // A real run plans and takes charges, so the screen behind it is stale.
        if (!opts.dryRun) await fetchBilling();
        return result.data;
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : 'Could not run the billing job'
        );
        return null;
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
    saveRule,
    runBilling,
    refetch: fetchBilling,
  };
}
