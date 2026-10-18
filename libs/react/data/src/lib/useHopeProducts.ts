'use client';

import { useCallback, useEffect, useState } from 'react';
import { httpsCallableFromURL } from 'firebase/functions';
import {
  getMapleFunctions,
  routerCallableUrl,
} from '@maple/ts/firebase/firebase-config';
import type {
  HopeProduct,
  RequestState,
  SaveHopeProductInput,
} from '@maple/ts/domain';
import type {
  GetHopeProductsRequest,
  GetHopeProductsResponse,
  SaveHopeProductRequest,
  SaveHopeProductResponse,
} from '@maple/ts/firebase/api-types';

function hydrate(product: HopeProduct): HopeProduct {
  return {
    ...product,
    createdAt: new Date(product.createdAt),
    updatedAt: new Date(product.updatedAt),
  };
}

/**
 * The studio's EMA portal products (WV Hope Scholarship): what each Hope
 * lesson is worth. Routes on the `hope` router.
 */
export function useHopeProducts() {
  const [productsState, setProductsState] = useState<
    RequestState<HopeProduct[]>
  >({ status: 'idle' });
  const [isSaving, setIsSaving] = useState(false);

  const fetchProducts = useCallback(async () => {
    setProductsState({ status: 'loading' });
    try {
      const fn = httpsCallableFromURL<
        GetHopeProductsRequest,
        GetHopeProductsResponse
      >(getMapleFunctions(), routerCallableUrl('hope', 'getHopeProducts'));
      const result = await fn({});
      setProductsState({
        status: 'success',
        data: result.data.products.map(hydrate),
      });
    } catch (error) {
      setProductsState({
        status: 'error',
        error:
          error instanceof Error ? error.message : 'Could not load EMA products',
      });
    }
  }, []);

  const saveProduct = useCallback(
    async (input: SaveHopeProductInput): Promise<HopeProduct> => {
      setIsSaving(true);
      try {
        const fn = httpsCallableFromURL<
          SaveHopeProductRequest,
          SaveHopeProductResponse
        >(getMapleFunctions(), routerCallableUrl('hope', 'saveHopeProduct'));
        const saved = hydrate((await fn(input)).data.product);
        setProductsState((prev) => {
          if (prev.status !== 'success') return prev;
          const rest = prev.data.filter((p) => p.id !== saved.id);
          return {
            status: 'success',
            data: [...rest, saved].sort((a, b) => a.name.localeCompare(b.name)),
          };
        });
        return saved;
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return { productsState, isSaving, fetchProducts, saveProduct };
}
