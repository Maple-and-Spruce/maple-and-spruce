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

import { useArtistPayouts } from './useArtistPayouts';

const wirePayout = {
  id: 'payout-1',
  artistId: 'artist-1',
  periodStart: '2026-09-01T04:00:00.000Z',
  periodEnd: '2026-10-01T03:59:59.999Z',
  saleCount: 2,
  totalSales: 150,
  totalCommission: 30,
  amountOwed: 120,
  status: 'pending',
  saleIds: ['sale-1', 'sale-2'],
  createdAt: '2026-10-02T12:00:00.000Z',
  updatedAt: '2026-10-02T12:00:00.000Z',
};
const paidPayout = { ...wirePayout, status: 'paid', paidAt: '2026-10-03T12:00:00.000Z' };

describe('useArtistPayouts', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.routes = {
      'payouts/getArtistPayouts': vi.fn().mockResolvedValue({ data: { payouts: [wirePayout] } }),
      'payouts/generateArtistPayout': vi.fn().mockResolvedValue({ data: { payout: wirePayout } }),
      'payouts/markArtistPayoutPaid': vi.fn().mockResolvedValue({ data: { payout: paidPayout } }),
    };
  });

  it('loads payouts from the payouts router, filtered, with dates rehydrated', async () => {
    const { result } = renderHook(() => useArtistPayouts({ artistId: 'artist-1', status: 'pending' }));

    await waitFor(() => expect(result.current.payoutsState.status).toBe('success'));
    expect(mocks.routes['payouts/getArtistPayouts']).toHaveBeenCalledWith({
      artistId: 'artist-1',
      status: 'pending',
    });
    const state = result.current.payoutsState;
    if (state.status !== 'success') throw new Error('expected success');
    expect(state.data[0].periodStart).toEqual(new Date(wirePayout.periodStart));
    expect(state.data[0].paidAt).toBeUndefined();
  });

  it('generates a payout for the period and refreshes the list', async () => {
    const { result } = renderHook(() => useArtistPayouts());
    await waitFor(() => expect(result.current.payoutsState.status).toBe('success'));

    const from = new Date('2026-09-01T04:00:00.000Z');
    const to = new Date('2026-10-01T03:59:59.999Z');
    let payout: Awaited<ReturnType<typeof result.current.generatePayout>> | undefined;
    await act(async () => {
      payout = await result.current.generatePayout('artist-1', from, to);
    });

    expect(mocks.routes['payouts/generateArtistPayout']).toHaveBeenCalledWith({
      artistId: 'artist-1',
      periodStart: from.toISOString(),
      periodEnd: to.toISOString(),
    });
    expect(payout?.createdAt).toEqual(new Date(wirePayout.createdAt));
    expect(mocks.routes['payouts/getArtistPayouts']).toHaveBeenCalledTimes(2);
  });

  it('marks a payout paid and refreshes the list', async () => {
    const { result } = renderHook(() => useArtistPayouts());
    await waitFor(() => expect(result.current.payoutsState.status).toBe('success'));

    let payout: Awaited<ReturnType<typeof result.current.markAsPaid>> | undefined;
    await act(async () => {
      payout = await result.current.markAsPaid('payout-1', 'check', 'CHK-001');
    });

    expect(mocks.routes['payouts/markArtistPayoutPaid']).toHaveBeenCalledWith({
      payoutId: 'payout-1',
      paymentMethod: 'check',
      paymentReference: 'CHK-001',
    });
    expect(payout?.paidAt).toEqual(new Date(paidPayout.paidAt));
    expect(mocks.routes['payouts/getArtistPayouts']).toHaveBeenCalledTimes(2);
  });

  it('reports a failed load as an error, not an empty list', async () => {
    mocks.routes['payouts/getArtistPayouts'].mockRejectedValue(new Error('permission-denied'));

    const { result } = renderHook(() => useArtistPayouts());

    await waitFor(() =>
      expect(result.current.payoutsState).toEqual({ status: 'error', error: 'permission-denied' })
    );
  });

  it('does not fetch when autoFetch is off', () => {
    const { result } = renderHook(() => useArtistPayouts({ autoFetch: false }));

    expect(result.current.payoutsState.status).toBe('idle');
    expect(mocks.routes['payouts/getArtistPayouts']).not.toHaveBeenCalled();
  });
});
