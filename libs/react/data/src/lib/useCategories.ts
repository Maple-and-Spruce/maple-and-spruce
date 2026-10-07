'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallableFromURL } from 'firebase/functions';
import {
  getMapleFunctions,
  routerCallableUrl,
} from '@maple/ts/firebase/firebase-config';
import type {
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetCategoriesRequest,
  GetCategoriesResponse,
  CreateCategoryRequest,
  CreateCategoryResponse,
  UpdateCategoryRequest,
  UpdateCategoryResponse,
  DeleteCategoryRequest,
  DeleteCategoryResponse,
  ReorderCategoriesRequest,
  ReorderCategoriesResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Hook for managing category CRUD operations
 *
 * Provides state management and API calls for the category management system.
 */
export function useCategories() {
  const [categoriesState, setCategoriesState] = useState<
    RequestState<Category[]>
  >({
    status: 'idle',
  });

  const fetchCategories = useCallback(async () => {
    setCategoriesState({ status: 'loading' });

    try {
      const functions = getMapleFunctions();
      const getCategories = httpsCallableFromURL<
        GetCategoriesRequest,
        GetCategoriesResponse
      >(functions, routerCallableUrl('products', 'getCategories'));

      const result = await getCategories({});
      setCategoriesState({
        status: 'success',
        data: result.data.categories,
      });
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      setCategoriesState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch categories',
      });
    }
  }, []);

  const createCategory = useCallback(
    async (input: CreateCategoryInput): Promise<Category> => {
      const functions = getMapleFunctions();
      const create = httpsCallableFromURL<
        CreateCategoryRequest,
        CreateCategoryResponse
      >(functions, routerCallableUrl('products', 'createCategory'));

      const result = await create(input);

      // Add the new category to state, sorted by order
      setCategoriesState((prev) => {
        if (prev.status !== 'success') return prev;
        const newData = [...prev.data, result.data.category].sort(
          (a, b) => a.order - b.order
        );
        return {
          ...prev,
          data: newData,
        };
      });

      return result.data.category;
    },
    []
  );

  const updateCategory = useCallback(
    async (input: UpdateCategoryInput): Promise<Category> => {
      const functions = getMapleFunctions();
      const update = httpsCallableFromURL<
        UpdateCategoryRequest,
        UpdateCategoryResponse
      >(functions, routerCallableUrl('products', 'updateCategory'));

      const result = await update(input);

      // Update the category in state and re-sort by order
      setCategoriesState((prev) => {
        if (prev.status !== 'success') return prev;
        const newData = prev.data
          .map((c) =>
            c.id === result.data.category.id ? result.data.category : c
          )
          .sort((a, b) => a.order - b.order);
        return {
          ...prev,
          data: newData,
        };
      });

      return result.data.category;
    },
    []
  );

  const deleteCategory = useCallback(async (id: string): Promise<void> => {
    const functions = getMapleFunctions();
    const del = httpsCallableFromURL<
      DeleteCategoryRequest,
      DeleteCategoryResponse
    >(functions, routerCallableUrl('products', 'deleteCategory'));

    await del({ id });

    // Remove the category from state
    setCategoriesState((prev) => {
      if (prev.status !== 'success') return prev;
      return {
        ...prev,
        data: prev.data.filter((c) => c.id !== id),
      };
    });
  }, []);

  /**
   * Reorder all categories by providing the complete ordered list of IDs.
   * This updates all order values atomically on the server.
   */
  const reorderCategories = useCallback(
    async (categoryIds: string[]): Promise<Category[]> => {
      const functions = getMapleFunctions();
      const reorder = httpsCallableFromURL<
        ReorderCategoriesRequest,
        ReorderCategoriesResponse
      >(functions, routerCallableUrl('products', 'reorderCategories'));

      const result = await reorder({ categoryIds });

      // Update state with the newly ordered categories
      setCategoriesState({
        status: 'success',
        data: result.data.categories,
      });

      return result.data.categories;
    },
    []
  );

  // Fetch categories on mount
  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  return {
    categoriesState,
    fetchCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
  };
}
