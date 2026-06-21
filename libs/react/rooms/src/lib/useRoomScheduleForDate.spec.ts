// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const callable = vi.fn();
vi.mock('firebase/functions', () => ({
  httpsCallable: () => callable,
}));
vi.mock('@maple/ts/firebase/firebase-config', () => ({
  getMapleFunctions: () => ({}),
}));

import { useRoomScheduleForDate } from './useRoomScheduleForDate';

afterEach(() => vi.clearAllMocks());
beforeEach(() => vi.clearAllMocks());

describe('useRoomScheduleForDate', () => {
  it('stays idle and issues no request when date is null', async () => {
    const { result } = renderHook(() => useRoomScheduleForDate('spruce', null));
    expect(result.current.roomScheduleState.status).toBe('idle');
    expect(callable).not.toHaveBeenCalled();
  });

  it('fetches the day and re-hydrates windows to Dates, sorted', async () => {
    callable.mockResolvedValue({
      data: {
        windows: [
          {
            eventId: 'b',
            title: 'Late',
            type: 'event',
            sourceRef: null,
            start: '2026-06-21T22:00:00.000Z',
            end: '2026-06-21T23:00:00.000Z',
          },
          {
            eventId: 'a',
            title: 'Early',
            type: 'lesson',
            sourceRef: null,
            start: '2026-06-21T20:00:00.000Z',
            end: '2026-06-21T20:30:00.000Z',
          },
        ],
      },
    });

    const { result } = renderHook(() =>
      useRoomScheduleForDate('spruce', new Date('2026-06-21T15:00:00Z'))
    );

    await waitFor(() =>
      expect(result.current.roomScheduleState.status).toBe('success')
    );
    const state = result.current.roomScheduleState;
    if (state.status !== 'success') throw new Error('expected success');
    expect(state.data[0].title).toBe('Early'); // sorted by start
    expect(state.data[0].start).toBeInstanceOf(Date);
    expect(callable).toHaveBeenCalledTimes(1);
    // queried the right room + an ISO day range
    const arg = callable.mock.calls[0][0];
    expect(arg.room).toBe('spruce');
    expect(typeof arg.start).toBe('string');
  });

  it('surfaces an error state when the callable rejects', async () => {
    callable.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() =>
      useRoomScheduleForDate('spruce', new Date('2026-06-21T15:00:00Z'))
    );
    await waitFor(() =>
      expect(result.current.roomScheduleState.status).toBe('error')
    );
  });
});
