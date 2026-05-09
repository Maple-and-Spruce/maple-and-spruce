'use client';

import { useState, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type { RequestState, Product } from '@maple/ts/domain';
import type {
  PushProductToEtsyRequest,
  PushProductToEtsyResponse,
  UpdateEtsyListingRequest,
  UpdateEtsyListingResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Push a Firestore product to Etsy as a (draft) listing, or update an
 * existing listing. Tracks an in-flight RequestState per call site so
 * a single Push button knows when its own request is loading.
 */
export function useEtsyPush() {
  const [pushState, setPushState] = useState<
    RequestState<PushProductToEtsyResponse>
  >({ status: 'idle' });
  const [updateState, setUpdateState] = useState<
    RequestState<UpdateEtsyListingResponse>
  >({ status: 'idle' });

  const pushToEtsy = useCallback(
    async (
      productId: string,
      activateAfterPush = false
    ): Promise<PushProductToEtsyResponse> => {
      setPushState({ status: 'loading' });
      try {
        const functions = getMapleFunctions();
        const push = httpsCallable<
          PushProductToEtsyRequest,
          PushProductToEtsyResponse
        >(functions, 'pushProductToEtsy');
        const result = await push({ productId, activateAfterPush });
        setPushState({ status: 'success', data: result.data });
        return result.data;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to push to Etsy';
        setPushState({ status: 'error', error: message });
        throw error;
      }
    },
    []
  );

  const updateEtsyListing = useCallback(
    async (productId: string): Promise<UpdateEtsyListingResponse> => {
      setUpdateState({ status: 'loading' });
      try {
        const functions = getMapleFunctions();
        const update = httpsCallable<
          UpdateEtsyListingRequest,
          UpdateEtsyListingResponse
        >(functions, 'updateEtsyListing');
        const result = await update({ productId });
        setUpdateState({ status: 'success', data: result.data });
        return result.data;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to update Etsy listing';
        setUpdateState({ status: 'error', error: message });
        throw error;
      }
    },
    []
  );

  const reset = useCallback(() => {
    setPushState({ status: 'idle' });
    setUpdateState({ status: 'idle' });
  }, []);

  /** Convenience: pick whichever response carries the updated product. */
  const lastProduct: Product | undefined =
    pushState.status === 'success'
      ? pushState.data.product
      : updateState.status === 'success'
        ? updateState.data.product
        : undefined;

  return {
    pushState,
    updateState,
    pushToEtsy,
    updateEtsyListing,
    reset,
    lastProduct,
  };
}
