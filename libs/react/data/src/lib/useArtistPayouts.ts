'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type { RequestState, Payout, PayoutStatus } from '@maple/ts/domain';
import type {
  GetPayoutsRequest,
  GetPayoutsResponse,
  GeneratePayoutRequest,
  GeneratePayoutResponse,
  MarkPayoutPaidRequest,
  MarkPayoutPaidResponse,
} from '@maple/ts/firebase/api-types';

export interface UseArtistPayoutsOptions {
  /** Filter by artist ID */
  artistId?: string;
  /** Filter by payout status */
  status?: PayoutStatus;
  /** Autofetch on mount and when filters change. Defaults true. */
  autoFetch?: boolean;
}

/**
 * Rehydrate date fields on a payout -- they arrive as ISO strings over the wire.
 */
function hydratePayout(payout: Payout): Payout {
  return {
    ...payout,
    periodStart: new Date(payout.periodStart),
    periodEnd: new Date(payout.periodEnd),
    createdAt: new Date(payout.createdAt),
    updatedAt: new Date(payout.updatedAt),
    paidAt: payout.paidAt ? new Date(payout.paidAt) : undefined,
  };
}

/**
 * Hook for managing artist payouts. Provides fetch, generate, and markAsPaid
 * operations following the same RequestState pattern as useTeacherPayouts.
 */
export function useArtistPayouts({
  artistId,
  status,
  autoFetch = true,
}: UseArtistPayoutsOptions = {}) {
  const [payoutsState, setPayoutsState] = useState<RequestState<Payout[]>>({
    status: 'idle',
  });

  const fetchPayouts = useCallback(async () => {
    setPayoutsState({ status: 'loading' });
    try {
      const functions = getMapleFunctions();
      const get = httpsCallable<GetPayoutsRequest, GetPayoutsResponse>(
        functions,
        'getPayouts'
      );

      const result = await get({ artistId, status });
      setPayoutsState({
        status: 'success',
        data: result.data.payouts.map(hydratePayout),
      });
    } catch (error) {
      console.error('Failed to fetch artist payouts:', error);
      setPayoutsState({
        status: 'error',
        error:
          error instanceof Error ? error.message : 'Failed to fetch payouts',
      });
    }
  }, [artistId, status]);

  useEffect(() => {
    if (autoFetch) {
      fetchPayouts();
    }
  }, [autoFetch, fetchPayouts]);

  const generatePayout = useCallback(
    async (
      targetArtistId: string,
      periodStart: Date,
      periodEnd: Date
    ): Promise<Payout> => {
      const functions = getMapleFunctions();
      const generate = httpsCallable<
        GeneratePayoutRequest,
        GeneratePayoutResponse
      >(functions, 'generatePayout');

      const result = await generate({
        artistId: targetArtistId,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      });

      // Re-fetch the list to include the new payout
      await fetchPayouts();

      return hydratePayout(result.data.payout);
    },
    [fetchPayouts]
  );

  const markAsPaid = useCallback(
    async (
      payoutId: string,
      paymentMethod: string,
      paymentReference?: string
    ): Promise<Payout> => {
      const functions = getMapleFunctions();
      const mark = httpsCallable<
        MarkPayoutPaidRequest,
        MarkPayoutPaidResponse
      >(functions, 'markPayoutPaid');

      const result = await mark({ payoutId, paymentMethod, paymentReference });

      // Re-fetch the list to reflect the updated status
      await fetchPayouts();

      return hydratePayout(result.data.payout);
    },
    [fetchPayouts]
  );

  return {
    payoutsState,
    fetchPayouts,
    generatePayout,
    markAsPaid,
  };
}
