// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

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

import { useTeacherPayouts } from './useTeacherPayouts';

const FROM = new Date('2026-09-01T04:00:00.000Z');
const TO = new Date('2026-10-01T03:59:59.999Z');

const wirePayout = {
  teacherId: 'inst-1',
  teacherName: 'Test Teacher',
  totalOwedCents: 5000,
  lines: [{ lessonId: 'lesson-1', scheduledAt: '2026-09-10T19:00:00.000Z', payoutCents: 5000 }],
};

describe('useTeacherPayouts', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.routes = {
      'payouts/getTeacherPayouts': vi.fn().mockResolvedValue({ data: { payouts: [wirePayout] } }),
    };
  });

  it('loads the period from the payouts router, with lesson dates rehydrated', async () => {
    const { result } = renderHook(() => useTeacherPayouts({ from: FROM, to: TO, teacherId: 'inst-1' }));

    await waitFor(() => expect(result.current.payoutsState.status).toBe('success'));
    expect(mocks.routes['payouts/getTeacherPayouts']).toHaveBeenCalledWith({
      from: FROM.toISOString(),
      to: TO.toISOString(),
      teacherId: 'inst-1',
    });
    const state = result.current.payoutsState;
    if (state.status !== 'success') throw new Error('expected success');
    expect(state.data[0].lines[0].scheduledAt).toEqual(new Date(wirePayout.lines[0].scheduledAt));
  });

  it('reports a failed load as an error, not an empty report', async () => {
    mocks.routes['payouts/getTeacherPayouts'].mockRejectedValue(new Error('permission-denied'));

    const { result } = renderHook(() => useTeacherPayouts({ from: FROM, to: TO }));

    await waitFor(() =>
      expect(result.current.payoutsState).toEqual({ status: 'error', error: 'permission-denied' })
    );
  });
});
