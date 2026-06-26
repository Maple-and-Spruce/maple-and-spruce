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

import { useRoomScheduleRange } from './useRoomScheduleRange';

afterEach(() => vi.clearAllMocks());
beforeEach(() => vi.clearAllMocks());

const start = new Date(2026, 5, 26, 0, 0);
const end = new Date(2026, 6, 24, 0, 0);

describe('useRoomScheduleRange', () => {
  it('fetches the range and re-hydrates windows to Dates, sorted by start', async () => {
    callable.mockResolvedValue({
      data: {
        windows: [
          {
            eventId: 'b',
            title: 'Later',
            type: 'event',
            sourceRef: null,
            start: '2026-06-28T20:00:00.000Z',
            end: '2026-06-28T21:00:00.000Z',
          },
          {
            eventId: 'a',
            title: 'Earlier',
            type: 'lesson',
            sourceRef: 'lessons/x',
            start: '2026-06-26T20:00:00.000Z',
            end: '2026-06-26T21:00:00.000Z',
          },
        ],
      },
    });

    const { result } = renderHook(() =>
      useRoomScheduleRange('spruce', start, end)
    );

    await waitFor(() =>
      expect(result.current.roomScheduleState.status).toBe('success')
    );

    const state = result.current.roomScheduleState;
    if (state.status !== 'success') throw new Error('expected success');
    expect(state.data.map((w) => w.eventId)).toEqual(['a', 'b']);
    expect(state.data[0].start).toBeInstanceOf(Date);
    expect(callable).toHaveBeenCalledWith({
      room: 'spruce',
      start: start.toISOString(),
      end: end.toISOString(),
    });
  });

  it('surfaces an error state when the call rejects', async () => {
    callable.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() =>
      useRoomScheduleRange('spruce', start, end)
    );

    await waitFor(() =>
      expect(result.current.roomScheduleState.status).toBe('error')
    );
    const state = result.current.roomScheduleState;
    if (state.status !== 'error') throw new Error('expected error');
    expect(state.error).toBe('boom');
  });
});
