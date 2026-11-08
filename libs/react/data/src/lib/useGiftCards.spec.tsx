// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  routes: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

vi.mock('firebase/functions', () => ({
  httpsCallableFromURL: (_functions: unknown, url: string) => mocks.routes[url],
}));
vi.mock('@maple/ts/firebase/firebase-config', () => ({
  getMapleFunctions: () => ({}),
  routerCallableUrl: (router: string, name: string) => `${router}/${name}`,
}));

import { useGiftCards } from './useGiftCards';

const overview = {
  totals: {
    outstandingCents: 0,
    cardsWithBalance: 0,
    loadedThisMonthCents: 0,
    spentThisMonthCents: 0,
  },
  cards: [],
  monthStartedAt: '2026-11-01T04:00:00.000Z',
};

describe('useGiftCards', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.routes = {
      'giftCards/getGiftCards': vi.fn().mockResolvedValue({ data: overview }),
      'giftCards/getGiftCard': vi.fn().mockResolvedValue({ data: { card: { id: 'gc' }, activities: [] } }),
      'giftCards/revealGiftCardCode': vi.fn().mockResolvedValue({ data: { code: '7783320000001111' } }),
      'giftCards/markClassCertificate': vi
        .fn()
        .mockResolvedValue({ data: { purchase: { giftCardId: 'gc', kind: 'class' } } }),
      'giftCards/issueGiftCard': vi
        .fn()
        .mockResolvedValue({ data: { giftCardId: 'gc-new', last4: '0001', recorded: true } }),
    };
  });

  it('loads the overview from the giftCards router on mount', async () => {
    const { result } = renderHook(() => useGiftCards());
    await waitFor(() => expect(result.current.giftCardsState.status).toBe('success'));
    expect(result.current.giftCardsState).toEqual({ status: 'success', data: overview });
  });

  it('reports a failed load as an error, not as no cards', async () => {
    mocks.routes['giftCards/getGiftCards'] = vi.fn().mockRejectedValue(new Error('Square down'));
    const { result } = renderHook(() => useGiftCards());
    await waitFor(() => expect(result.current.giftCardsState.status).toBe('error'));
    expect(result.current.giftCardsState).toEqual({ status: 'error', error: 'Square down' });
  });

  it('fetches one card and reveals its code by id', async () => {
    const { result } = renderHook(() => useGiftCards());
    await waitFor(() => expect(result.current.giftCardsState.status).toBe('success'));

    let code = '';
    await act(async () => {
      await result.current.fetchGiftCard('gc');
      code = await result.current.revealGiftCardCode('gc');
    });

    expect(mocks.routes['giftCards/getGiftCard']).toHaveBeenCalledWith({ id: 'gc' });
    expect(mocks.routes['giftCards/revealGiftCardCode']).toHaveBeenCalledWith({ id: 'gc' });
    expect(code).toBe('7783320000001111');
  });

  it('marks a class certificate and issues a free card through the giftCards router', async () => {
    const { result } = renderHook(() => useGiftCards());
    await waitFor(() => expect(result.current.giftCardsState.status).toBe('success'));

    const markRequest = { giftCardId: 'gc', classCategoryId: 'cat-1' };
    const issueRequest = {
      kind: 'amount' as const,
      amountCents: 2500,
      reason: 'Raffle prize',
      idempotencyKey: 'issue-abc12345',
    };
    let marked: unknown;
    let issued: unknown;
    await act(async () => {
      marked = await result.current.markClassCertificate(markRequest);
      issued = await result.current.issueGiftCard(issueRequest);
    });

    expect(mocks.routes['giftCards/markClassCertificate']).toHaveBeenCalledWith(markRequest);
    expect(mocks.routes['giftCards/issueGiftCard']).toHaveBeenCalledWith(issueRequest);
    expect(marked).toEqual({ purchase: { giftCardId: 'gc', kind: 'class' } });
    expect(issued).toEqual({ giftCardId: 'gc-new', last4: '0001', recorded: true });
  });
});
