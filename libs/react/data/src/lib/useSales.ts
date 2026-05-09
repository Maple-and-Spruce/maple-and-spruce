'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type { RequestState, Sale, SaleSource } from '@maple/ts/domain';
import type {
  GetSalesRequest,
  GetSalesResponse,
  RecordProductSaleRequest,
  RecordProductSaleResponse,
} from '@maple/ts/firebase/api-types';

export interface UseSalesOptions {
  artistId?: string;
  source?: SaleSource;
  /** ISO date string */
  from?: string;
  /** ISO date string */
  to?: string;
  /** Autofetch on mount and when filters change. Defaults true. */
  autoFetch?: boolean;
}

function hydrateSale(sale: Sale): Sale {
  return {
    ...sale,
    soldAt: new Date(sale.soldAt),
    createdAt: new Date(sale.createdAt),
  };
}

/**
 * Hook for fetching and recording sales. Filters are passed straight
 * through to `getSales`; manual sales are recorded via `recordSale`.
 */
export function useSales({
  artistId,
  source,
  from,
  to,
  autoFetch = true,
}: UseSalesOptions = {}) {
  const [salesState, setSalesState] = useState<RequestState<Sale[]>>({
    status: 'idle',
  });

  const fetchSales = useCallback(async () => {
    setSalesState({ status: 'loading' });
    try {
      const functions = getMapleFunctions();
      const get = httpsCallable<GetSalesRequest, GetSalesResponse>(
        functions,
        'getSales'
      );

      const result = await get({ artistId, source, from, to });
      setSalesState({
        status: 'success',
        data: result.data.sales.map(hydrateSale),
      });
    } catch (error) {
      console.error('Failed to fetch sales:', error);
      setSalesState({
        status: 'error',
        error:
          error instanceof Error ? error.message : 'Failed to fetch sales',
      });
    }
  }, [artistId, source, from, to]);

  useEffect(() => {
    if (autoFetch) {
      fetchSales();
    }
  }, [autoFetch, fetchSales]);

  const recordSale = useCallback(
    async (request: RecordProductSaleRequest): Promise<Sale> => {
      const functions = getMapleFunctions();
      const record = httpsCallable<
        RecordProductSaleRequest,
        RecordProductSaleResponse
      >(functions, 'recordSale');

      const result = await record(request);
      const sale = hydrateSale(result.data.sale);

      // Optimistically prepend so the table reflects it without a refetch.
      setSalesState((prev) => {
        if (prev.status !== 'success') return prev;
        return { ...prev, data: [sale, ...prev.data] };
      });

      return sale;
    },
    []
  );

  return {
    salesState,
    fetchSales,
    recordSale,
  };
}
