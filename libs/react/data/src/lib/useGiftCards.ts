'use client';

import { useCallback, useEffect, useState } from 'react';
import { httpsCallableFromURL } from 'firebase/functions';
import {
  getMapleFunctions,
  routerCallableUrl,
} from '@maple/ts/firebase/firebase-config';
import type { RequestState } from '@maple/ts/domain';
import type {
  GetGiftCardRequest,
  GetGiftCardResponse,
  GetGiftCardsRequest,
  GetGiftCardsResponse,
  IssueGiftCardRequest,
  IssueGiftCardResponse,
  MarkClassCertificateRequest,
  MarkClassCertificateResponse,
  RevealGiftCardCodeRequest,
  RevealGiftCardCodeResponse,
} from '@maple/ts/firebase/api-types';

/**
 * The admin Gift Cards page (#297), served by the `giftCards` router. Square
 * owns every card; these calls read it back live.
 */
export function useGiftCards() {
  const [giftCardsState, setGiftCardsState] = useState<
    RequestState<GetGiftCardsResponse>
  >({ status: 'idle' });

  const fetchGiftCards = useCallback(async () => {
    setGiftCardsState({ status: 'loading' });
    try {
      const fn = httpsCallableFromURL<GetGiftCardsRequest, GetGiftCardsResponse>(
        getMapleFunctions(),
        routerCallableUrl('giftCards', 'getGiftCards')
      );
      const result = await fn({});
      setGiftCardsState({ status: 'success', data: result.data });
    } catch (error) {
      console.error('Failed to fetch gift cards:', error);
      setGiftCardsState({
        status: 'error',
        error:
          error instanceof Error ? error.message : 'Failed to load gift cards',
      });
    }
  }, []);

  /** One card and its history. */
  const fetchGiftCard = useCallback(
    async (id: string): Promise<GetGiftCardResponse> => {
      const fn = httpsCallableFromURL<GetGiftCardRequest, GetGiftCardResponse>(
        getMapleFunctions(),
        routerCallableUrl('giftCards', 'getGiftCard')
      );
      const result = await fn({ id });
      return result.data;
    },
    []
  );

  /** The card's full code. Each call is logged on the server. */
  const revealGiftCardCode = useCallback(async (id: string): Promise<string> => {
    const fn = httpsCallableFromURL<
      RevealGiftCardCodeRequest,
      RevealGiftCardCodeResponse
    >(getMapleFunctions(), routerCallableUrl('giftCards', 'revealGiftCardCode'));
    const result = await fn({ id });
    return result.data.code;
  }, []);

  /**
   * Make a register-sold card a class certificate (#310). Writes our record
   * only; nothing changes in Square.
   */
  const markClassCertificate = useCallback(
    async (
      request: MarkClassCertificateRequest
    ): Promise<MarkClassCertificateResponse> => {
      const fn = httpsCallableFromURL<
        MarkClassCertificateRequest,
        MarkClassCertificateResponse
      >(getMapleFunctions(), routerCallableUrl('giftCards', 'markClassCertificate'));
      const result = await fn(request);
      return result.data;
    },
    []
  );

  /** Give a free card (#310): makes and loads a card in Square. */
  const issueGiftCard = useCallback(
    async (request: IssueGiftCardRequest): Promise<IssueGiftCardResponse> => {
      const fn = httpsCallableFromURL<IssueGiftCardRequest, IssueGiftCardResponse>(
        getMapleFunctions(),
        routerCallableUrl('giftCards', 'issueGiftCard')
      );
      const result = await fn(request);
      return result.data;
    },
    []
  );

  useEffect(() => {
    fetchGiftCards();
  }, [fetchGiftCards]);

  return {
    giftCardsState,
    fetchGiftCards,
    fetchGiftCard,
    revealGiftCardCode,
    markClassCertificate,
    issueGiftCard,
  };
}
