// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ callDeduped: vi.fn() }));

vi.mock('./call-deduped', () => ({ callDeduped: mocks.callDeduped }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => vi.fn() }));
vi.mock('@maple/ts/firebase/firebase-config', () => ({
  getMapleFunctions: () => ({}),
}));

import { useMusicTogetherRoster } from './useMusicTogetherRoster';

/**
 * The response as it ACTUALLY arrives in the browser: a callable serializes
 * every Date to an ISO string, even though the response type declares Date.
 * Building the fixture from the declared type is what hid this bug the first
 * time, so this one is deliberately the wire shape.
 */
function wireRosterResponse() {
  return {
    data: {
      section: {
        id: 'sec-1',
        name: 'Thursday Morning',
        sessions: [{ dateTime: '2026-09-10T14:00:00.000Z' }],
        capacityFamilies: 8,
        priceFullCents: 25200,
        installmentPlan: [
          { amountCents: 13200, dueAt: '2026-09-10T14:00:00.000Z' },
        ],
        visible: true,
        enrollmentActive: true,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
      entries: [
        {
          registration: {
            id: 'reg-1',
            parentNames: ['Coral Bex'],
            children: [{ name: 'Ari', dob: '2025-11-19T00:00:00.000Z' }],
            paymentPlan: 'installments',
            pricePaidCents: 13200,
            status: 'confirmed',
            createdAt: '2026-08-20T00:00:00.000Z',
            updatedAt: '2026-08-20T00:00:00.000Z',
          },
          charges: [
            {
              id: 'chg-1',
              registrationId: 'reg-1',
              installmentNumber: 2,
              amountCents: 13200,
              dueAt: '2026-10-08T14:00:00.000Z',
              status: 'scheduled',
            },
          ],
          pastDue: false,
        },
      ],
      waitlist: [],
    },
  };
}

describe('useMusicTogetherRoster', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callDeduped.mockResolvedValue(wireRosterResponse());
  });

  it('THE REGRESSION: hydrates the SECTION, not just entries', async () => {
    // An unhydrated section left sessions[].dateTime as strings, which crashed
    // the whole admin page when an admin clicked Cancel / refund —
    // mtRefundCents calls .getTime() on the first session.
    const { result } = renderHook(() => useMusicTogetherRoster('sec-1'));

    await waitFor(() =>
      expect(result.current.rosterState.status).toBe('success')
    );

    const state = result.current.rosterState;
    if (state.status !== 'success') throw new Error('expected success');

    expect(state.data.section.sessions[0].dateTime).toBeInstanceOf(Date);
    expect(state.data.section.installmentPlan?.[0].dueAt).toBeInstanceOf(Date);
    expect(state.data.section.createdAt).toBeInstanceOf(Date);
  });

  it('still hydrates entries and their charges', async () => {
    const { result } = renderHook(() => useMusicTogetherRoster('sec-1'));

    await waitFor(() =>
      expect(result.current.rosterState.status).toBe('success')
    );
    const state = result.current.rosterState;
    if (state.status !== 'success') throw new Error('expected success');

    const entry = state.data.entries[0];
    expect(entry.registration.children[0].dob).toBeInstanceOf(Date);
    expect(entry.registration.createdAt).toBeInstanceOf(Date);
    expect(entry.charges[0].dueAt).toBeInstanceOf(Date);
  });

  it('stays idle with no section id', async () => {
    const { result } = renderHook(() => useMusicTogetherRoster(undefined));

    await waitFor(() =>
      expect(result.current.rosterState.status).toBe('idle')
    );
    expect(mocks.callDeduped).not.toHaveBeenCalled();
  });
});
