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

import { useInstructors } from './useInstructors';

const olive = { id: 'i-2', name: 'Olive Thompson', status: 'active' };
const robin = { id: 'i-1', name: 'Robin Ashfield', status: 'active' };

describe('useInstructors', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.routes = {
      'instructors/getInstructors': vi
        .fn()
        .mockResolvedValue({ data: { instructors: [olive] } }),
      'instructors/createInstructor': vi
        .fn()
        .mockResolvedValue({ data: { instructor: robin } }),
      'instructors/updateInstructor': vi.fn().mockResolvedValue({
        data: { instructor: { ...olive, name: 'Olive Thompson-Reyes' } },
      }),
      'instructors/deleteInstructor': vi
        .fn()
        .mockResolvedValue({ data: { success: true } }),
    };
  });

  async function loaded() {
    const hook = renderHook(() => useInstructors());
    await waitFor(() =>
      expect(hook.result.current.instructorsState.status).toBe('success')
    );
    return hook;
  }

  it('loads instructors from the instructors router', async () => {
    const { result } = await loaded();

    expect(mocks.routes['instructors/getInstructors']).toHaveBeenCalledWith({});
    expect(result.current.instructorsState).toEqual({
      status: 'success',
      data: [olive],
    });
  });

  it('creates through the router and keeps the list sorted by name', async () => {
    const { result } = await loaded();

    await act(() => result.current.createInstructor({ name: 'Robin Ashfield', status: 'active' } as never));

    const state = result.current.instructorsState;
    if (state.status !== 'success') throw new Error('expected success');
    expect(state.data.map((i) => i.name)).toEqual(['Olive Thompson', 'Robin Ashfield']);
  });

  it('updates and deletes through the router', async () => {
    const { result } = await loaded();

    await act(() => result.current.updateInstructor({ id: 'i-2', name: 'Olive Thompson-Reyes' }));
    expect(mocks.routes['instructors/updateInstructor']).toHaveBeenCalledWith({
      id: 'i-2',
      name: 'Olive Thompson-Reyes',
    });

    await act(() => result.current.deleteInstructor('i-2'));
    expect(mocks.routes['instructors/deleteInstructor']).toHaveBeenCalledWith({ id: 'i-2' });
    const state = result.current.instructorsState;
    if (state.status !== 'success') throw new Error('expected success');
    expect(state.data).toEqual([]);
  });

  it('reports a failed load as an error, not as no instructors', async () => {
    mocks.routes['instructors/getInstructors'].mockRejectedValue(new Error('internal'));

    const { result } = renderHook(() => useInstructors());

    await waitFor(() =>
      expect(result.current.instructorsState).toEqual({ status: 'error', error: 'internal' })
    );
  });
});
