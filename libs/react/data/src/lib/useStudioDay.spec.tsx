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

import { useStudioDay } from './useStudioDay';

const wireLesson = {
  lesson: {
    id: 'les-1',
    studentId: 'stu-1',
    teacherId: 'instr-1',
    scheduledAt: '2026-10-14T19:00:00.000Z',
    durationMinutes: 30,
    status: 'scheduled',
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
  },
  studentName: 'Test Student',
  teacherName: 'Test Teacher',
  payment: { state: 'paid' },
};

describe('useStudioDay', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.routes = {
      'lessons/getStudioDay': vi
        .fn()
        .mockResolvedValue({ data: { lessons: [wireLesson] } }),
    };
  });

  it("loads today's lessons from the lessons router, dates rehydrated", async () => {
    const { result } = renderHook(() => useStudioDay());

    await waitFor(() => expect(result.current.dayState.status).toBe('success'));
    const [args] = mocks.routes['lessons/getStudioDay'].mock.calls[0];
    expect(new Date(args.to).getTime() - new Date(args.from).getTime()).toBe(
      24 * 3600_000 - 1 + (new Date(args.to).getTimezoneOffset() - new Date(args.from).getTimezoneOffset()) * 60_000
    );
    const state = result.current.dayState;
    if (state.status !== 'success') throw new Error('expected success');
    expect(state.data.lessons[0].lesson.scheduledAt).toEqual(
      new Date(wireLesson.lesson.scheduledAt)
    );
  });

  it('never calls the route when disabled', () => {
    const { result } = renderHook(() => useStudioDay(false));
    expect(result.current.dayState.status).toBe('idle');
    expect(mocks.routes['lessons/getStudioDay']).not.toHaveBeenCalled();
  });

  it('reports a failed load as an error', async () => {
    mocks.routes['lessons/getStudioDay'].mockRejectedValue(
      new Error('permission-denied')
    );
    const { result } = renderHook(() => useStudioDay());
    await waitFor(() =>
      expect(result.current.dayState).toEqual({
        status: 'error',
        error: 'permission-denied',
      })
    );
  });
});
