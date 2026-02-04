'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  Discount,
  CreateDiscountInput,
  UpdateDiscountInput,
  DiscountStatus,
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
  }, [filters?.status]);

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
