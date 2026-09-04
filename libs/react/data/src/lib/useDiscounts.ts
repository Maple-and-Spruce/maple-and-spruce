'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  Discount,
  CreateDiscountInput,
  UpdateDiscountInput,
  DiscountStatus,
  DiscountProgram,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetDiscountsRequest,
  GetDiscountsResponse,
  CreateDiscountRequest,
  CreateDiscountResponse,
  UpdateDiscountRequest,
  UpdateDiscountResponse,
  DeleteDiscountRequest,
  DeleteDiscountResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Filters for fetching discounts
 */
export interface UseDiscountsFilters {
  status?: DiscountStatus;
  /**
   * Which program's codes to manage. Each admin page pins this so the two
   * never mix. It is a filter, not a permission — the server forces a
   * non-admin caller to `music-together` regardless of what is sent.
   */
  program?: DiscountProgram;
}

/**
 * Hook for managing discount CRUD operations
 */
export function useDiscounts(filters?: UseDiscountsFilters) {
  const [discountsState, setDiscountsState] = useState<
    RequestState<Discount[]>
  >({
    status: 'idle',
  });

  const fetchDiscounts = useCallback(async () => {
    setDiscountsState({ status: 'loading' });

    try {
      const functions = getMapleFunctions();
      const getDiscounts = httpsCallable<
        GetDiscountsRequest,
        GetDiscountsResponse
      >(functions, 'getDiscounts');

      const result = await getDiscounts({
        status: filters?.status,
        program: filters?.program,
      });
      setDiscountsState({
        status: 'success',
        data: result.data.discounts,
      });
    } catch (error) {
      console.error('Failed to fetch discounts:', error);
      setDiscountsState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch discounts',
      });
    }
  }, [filters?.status, filters?.program]);

  const createDiscount = useCallback(
    async (input: CreateDiscountInput): Promise<Discount> => {
      const functions = getMapleFunctions();
      const create = httpsCallable<
        CreateDiscountRequest,
        CreateDiscountResponse
      >(functions, 'createDiscount');

      const result = await create(input);

      setDiscountsState((prev) => {
        if (prev.status !== 'success') return prev;
        return {
          ...prev,
          data: [...prev.data, result.data.discount],
        };
      });

      return result.data.discount;
    },
    []
  );

  const updateDiscount = useCallback(
    async (input: UpdateDiscountInput): Promise<Discount> => {
      const functions = getMapleFunctions();
      const update = httpsCallable<
        UpdateDiscountRequest,
        UpdateDiscountResponse
      >(functions, 'updateDiscount');

      const result = await update(input);

      setDiscountsState((prev) => {
        if (prev.status !== 'success') return prev;
        return {
          ...prev,
          data: prev.data.map((d) =>
            d.id === result.data.discount.id ? result.data.discount : d
          ),
        };
      });

      return result.data.discount;
    },
    []
  );

  const deleteDiscount = useCallback(async (id: string): Promise<void> => {
    const functions = getMapleFunctions();
    const del = httpsCallable<DeleteDiscountRequest, DeleteDiscountResponse>(
      functions,
      'deleteDiscount'
    );

    await del({ id });

    setDiscountsState((prev) => {
      if (prev.status !== 'success') return prev;
      return {
        ...prev,
        data: prev.data.filter((d) => d.id !== id),
      };
    });
  }, []);

  useEffect(() => {
    fetchDiscounts();
  }, [fetchDiscounts]);

  return {
    discountsState,
    fetchDiscounts,
    createDiscount,
    updateDiscount,
    deleteDiscount,
  };
}
