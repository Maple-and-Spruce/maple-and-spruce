'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type { ClassCategory, RequestState } from '@maple/ts/domain';
import type {
  GetClassCategoriesRequest,
  GetClassCategoriesResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Hook for fetching class categories
 *
 * Provides state management and API calls for class category data.
 * Categories are used for filtering classes in the admin UI and public display.
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

  // Fetch categories on mount
  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  return {
    categoriesState,
    fetchCategories,
  };
}
