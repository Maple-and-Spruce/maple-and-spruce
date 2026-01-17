'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  Product,
  CreateProductInput,
  UpdateProductInput,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetProductsRequest,
  GetProductsResponse,
  CreateProductRequest,
  CreateProductResponse,
  UpdateProductRequest,
  UpdateProductResponse,
  DeleteProductRequest,
  DeleteProductResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Hook for managing product CRUD operations
 *
 * Provides state management and API calls for the inventory system.
 */
export function useProducts() {
  const [productsState, setProductsState] = useState<RequestState<Product[]>>({
    status: 'idle',
  });

  const fetchProducts = useCallback(async () => {
    setProductsState({ status: 'loading' });

    try {
      const functions = getMapleFunctions();
      const getProducts = httpsCallable<GetProductsRequest, GetProductsResponse>(
        functions,
        'getProducts'
      );

      const result = await getProducts({});
      setProductsState({
        status: 'success',
        data: result.data.products,
      });
    } catch (error) {
      console.error('Failed to fetch products:', error);
      setProductsState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to fetch products',
      });
    }
  }, []);

  const createProduct = useCallback(
    async (input: CreateProductInput): Promise<Product> => {
      const functions = getMapleFunctions();
      const create = httpsCallable<CreateProductRequest, CreateProductResponse>(
        functions,
        'createProduct'
      );

      const result = await create(input);

      // Add the new product to state
      setProductsState((prev) => {
        if (prev.status !== 'success') return prev;
        return {
          ...prev,
          data: [result.data.product, ...prev.data],
        };
      });

      return result.data.product;
    },
    []
  );

  const updateProduct = useCallback(
    async (input: UpdateProductInput): Promise<Product> => {
      const functions = getMapleFunctions();
      const update = httpsCallable<UpdateProductRequest, UpdateProductResponse>(
        functions,
        'updateProduct'
      );

      const result = await update(input);

      // Update the product in state
      setProductsState((prev) => {
        if (prev.status !== 'success') return prev;
        return {
          ...prev,
          data: prev.data.map((p) =>
            p.id === result.data.product.id ? result.data.product : p
          ),
        };
      });

      return result.data.product;
    },
    []
  );

  const deleteProduct = useCallback(async (id: string): Promise<void> => {
    const functions = getMapleFunctions();
    const del = httpsCallable<DeleteProductRequest, DeleteProductResponse>(
      functions,
      'deleteProduct'
    );

    await del({ id });

    // Remove the product from state
    setProductsState((prev) => {
      if (prev.status !== 'success') return prev;
      return {
        ...prev,
        data: prev.data.filter((p) => p.id !== id),
      };
    });
  }, []);

  // Fetch products on mount
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return {
    productsState,
    fetchProducts,
    createProduct,
    updateProduct,
    deleteProduct,
  };
}
