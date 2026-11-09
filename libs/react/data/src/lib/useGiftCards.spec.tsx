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

import { useCertificateBatch, useGiftCards } from './useGiftCards';

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
      'giftCards/printGiftCertificates': vi
        .fn()
        .mockResolvedValue({ data: { batchId: 'cert-1', requested: 1, cards: [], valueCents: 2500 } }),
      'giftCards/getCertificateBatch': vi
        .fn()
        .mockResolvedValue({ data: { batchId: 'cert-1', certificates: [] } }),
      'giftCards/getGiftCardBuyer': vi
        .fn()
        .mockResolvedValue({ data: { linkedCustomers: [] } }),
      'giftCards/searchGiftCardsByCustomer': vi.fn().mockResolvedValue({
        data: { matches: [], cards: [], searchedSince: '2024-11-01T00:00:00Z', searchedBy: 'name' },
      }),
      'giftCards/replaceGiftCard': vi.fn().mockResolvedValue({
        data: { oldGiftCardId: 'gc', newGiftCardId: 'gc-2', last4: '0002', balanceCents: 1500 },
      }),
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

  it('prints a batch through the giftCards router (#314)', async () => {
    const { result } = renderHook(() => useGiftCards());
    await waitFor(() => expect(result.current.giftCardsState.status).toBe('success'));
    const request = {
      kind: 'amount' as const,
      amountCents: 2500,
      quantity: 1,
      design: 'stained-glass' as const,
      idempotencyKey: 'print-abc12345',
    };
    let printed: unknown;
    await act(async () => {
      printed = await result.current.printGiftCertificates(request);
    });
    expect(mocks.routes['giftCards/printGiftCertificates']).toHaveBeenCalledWith(request);
    expect(printed).toMatchObject({ batchId: 'cert-1' });
  });

  it('calls the buyer, search and replace routes (#332) on the giftCards router with its request', async () => {
    const { result } = renderHook(() => useGiftCards());
    await waitFor(() => expect(result.current.giftCardsState.status).toBe('success'));

    let replaced: { newGiftCardId: string } | undefined;
    await act(async () => {
      await result.current.fetchGiftCardBuyer('gc');
      await result.current.searchGiftCardsByCustomer('Robin');
      replaced = await result.current.replaceGiftCard({ giftCardId: 'gc', idempotencyKey: 'k' });
    });

    expect(mocks.routes['giftCards/getGiftCardBuyer']).toHaveBeenCalledWith({ id: 'gc' });
    expect(mocks.routes['giftCards/searchGiftCardsByCustomer']).toHaveBeenCalledWith({
      query: 'Robin',
    });
    expect(mocks.routes['giftCards/replaceGiftCard']).toHaveBeenCalledWith({
      giftCardId: 'gc',
      idempotencyKey: 'k',
    });
    expect(replaced?.newGiftCardId).toBe('gc-2');
  });
});

describe('useCertificateBatch (#314)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('loads the batch by id', async () => {
    mocks.routes['giftCards/getCertificateBatch'] = vi
      .fn()
      .mockResolvedValue({ data: { batchId: 'cert-1', certificates: [] } });
    const { result } = renderHook(() => useCertificateBatch('cert-1'));
    await waitFor(() => expect(result.current.batchState.status).toBe('success'));
    expect(mocks.routes['giftCards/getCertificateBatch']).toHaveBeenCalledWith({ batchId: 'cert-1' });
  });

  it('reports a failed load as an error', async () => {
    mocks.routes['giftCards/getCertificateBatch'] = vi.fn().mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useCertificateBatch('cert-1'));
    await waitFor(() => expect(result.current.batchState).toEqual({ status: 'error', error: 'nope' }));
  });

  it('stays idle without a batch id', () => {
    const { result } = renderHook(() => useCertificateBatch(''));
    expect(result.current.batchState.status).toBe('idle');
  });
});
