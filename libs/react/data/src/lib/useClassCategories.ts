'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  ClassCategory,
  CreateClassCategoryInput,
  UpdateClassCategoryInput,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetClassCategoriesRequest,
  GetClassCategoriesResponse,
  CreateClassCategoryRequest,
  CreateClassCategoryResponse,
  UpdateClassCategoryRequest,
  UpdateClassCategoryResponse,
  DeleteClassCategoryRequest,
  DeleteClassCategoryResponse,
  ReorderClassCategoriesRequest,
  ReorderClassCategoriesResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Hook for managing class category CRUD operations
 *
 * Provides state management and API calls for class category data.
 * Categories are used for organizing classes and for agreement auto-attach.
 */
export function useClassCategories() {
  const [categoriesState, setCategoriesState] = useState<
    RequestState<ClassCategory[]>
  >({
    status: 'idle',
  });

  const fetchCategories = useCallback(async () => {
    setCategoriesState({ status: 'loading' });

    try {
      const functions = getMapleFunctions();
      const getClassCategories = httpsCallable<
        GetClassCategoriesRequest,
        GetClassCategoriesResponse
      >(functions, 'getClassCategories');

      const result = await getClassCategories({});
      setCategoriesState({
        status: 'success',
        data: result.data.categories,
      });
    } catch (error) {
      console.error('Failed to fetch class categories:', error);
      setCategoriesState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch class categories',
      });
    }
  }, []);

  const createClassCategory = useCallback(
    async (input: CreateClassCategoryInput): Promise<ClassCategory> => {
      const functions = getMapleFunctions();
      const create = httpsCallable<
        CreateClassCategoryRequest,
        CreateClassCategoryResponse
      >(functions, 'createClassCategory');

      const result = await create(input);

      setCategoriesState((prev) => {
        if (prev.status !== 'success') return prev;
        const newData = [...prev.data, result.data.category].sort(
          (a, b) => a.order - b.order
        );
        return { ...prev, data: newData };
      });

      return result.data.category;
    },
    []
  );

  const updateClassCategory = useCallback(
    async (input: UpdateClassCategoryInput): Promise<ClassCategory> => {
      const functions = getMapleFunctions();
      const update = httpsCallable<
        UpdateClassCategoryRequest,
        UpdateClassCategoryResponse
      >(functions, 'updateClassCategory');

      const result = await update(input);

      setCategoriesState((prev) => {
        if (prev.status !== 'success') return prev;
        const newData = prev.data
          .map((c) =>
            c.id === result.data.category.id ? result.data.category : c
          )
          .sort((a, b) => a.order - b.order);
        return { ...prev, data: newData };
      });

      return result.data.category;
    },
    []
  );

  const deleteClassCategory = useCallback(
    async (id: string): Promise<void> => {
      const functions = getMapleFunctions();
      const del = httpsCallable<
        DeleteClassCategoryRequest,
        DeleteClassCategoryResponse
      >(functions, 'deleteClassCategory');

      await del({ id });

      setCategoriesState((prev) => {
        if (prev.status !== 'success') return prev;
        return { ...prev, data: prev.data.filter((c) => c.id !== id) };
      });
    },
    []
  );

  const reorderClassCategories = useCallback(
    async (categoryIds: string[]): Promise<ClassCategory[]> => {
      const functions = getMapleFunctions();
      const reorder = httpsCallable<
        ReorderClassCategoriesRequest,
        ReorderClassCategoriesResponse
      >(functions, 'reorderClassCategories');

      const result = await reorder({ categoryIds });

      setCategoriesState({
        status: 'success',
        data: result.data.categories,
      });

      return result.data.categories;
    },
    []
  );

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  return {
    categoriesState,
    fetchCategories,
    createClassCategory,
    updateClassCategory,
    deleteClassCategory,
    reorderClassCategories,
  };
}
