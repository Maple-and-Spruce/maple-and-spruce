// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { InboxItem } from '@maple/ts/domain';

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

import { useInbox } from './useInbox';

function item(key: string): InboxItem {
  return {
    key,
    kind: 'lesson-inquiry',
    title: `Title ${key}`,
    href: '/leads',
    actionLabel: 'Reply',
    occurredAt: '2026-10-14T12:00:00.000Z',
    urgent: false,
  };
}

const ITEMS = [item('lesson-inquiry:a'), item('lesson-inquiry:b'), item('lesson-inquiry:c')];
const keys = (state: ReturnType<typeof useInbox>['inboxState']) =>
  state.status === 'success' ? state.data.map((i) => i.key) : null;

describe('useInbox', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.routes = {
      'lessons/getInbox': vi.fn().mockResolvedValue({ data: { items: ITEMS } }),
      'lessons/dismissInboxItem': vi
        .fn()
        .mockImplementation(async ({ key }) => ({ data: { key } })),
    };
  });

  it('loads the inbox from the lessons router', async () => {
    const { result } = renderHook(() => useInbox());
    await waitFor(() => expect(result.current.inboxState.status).toBe('success'));
    expect(keys(result.current.inboxState)).toEqual(ITEMS.map((i) => i.key));
  });

  it('never calls the route when disabled', () => {
    const { result } = renderHook(() => useInbox(false));
    expect(result.current.inboxState.status).toBe('idle');
    expect(mocks.routes['lessons/getInbox']).not.toHaveBeenCalled();
  });

  it('reports a failed load as an error', async () => {
    mocks.routes['lessons/getInbox'].mockRejectedValue(new Error('permission-denied'));
    const { result } = renderHook(() => useInbox());
    await waitFor(() =>
      expect(result.current.inboxState).toEqual({
        status: 'error',
        error: 'permission-denied',
      })
    );
  });

  it('removes a dismissed item at once and records it', async () => {
    const server = { resolve: (_value: { data: { key: string } }) => undefined as void };
    mocks.routes['lessons/dismissInboxItem'].mockReturnValue(
      new Promise((resolve) => {
        server.resolve = resolve;
      })
    );
    const { result } = renderHook(() => useInbox());
    await waitFor(() => expect(result.current.inboxState.status).toBe('success'));

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.dismiss('lesson-inquiry:b');
    });
    // Gone before the server answers.
    expect(keys(result.current.inboxState)).toEqual([
      'lesson-inquiry:a',
      'lesson-inquiry:c',
    ]);
    await act(async () => {
      server.resolve({ data: { key: 'lesson-inquiry:b' } });
      await pending;
    });
    expect(mocks.routes['lessons/dismissInboxItem']).toHaveBeenCalledWith({
      key: 'lesson-inquiry:b',
    });
    expect(result.current.dismissError).toBeNull();
  });

  it('puts the item back in its place, with an error, when the call fails', async () => {
    mocks.routes['lessons/dismissInboxItem'].mockImplementation(async ({ key }) => {
      if (key === 'lesson-inquiry:b') throw new Error('unavailable');
      return { data: { key } };
    });
    const { result } = renderHook(() => useInbox());
    await waitFor(() => expect(result.current.inboxState.status).toBe('success'));

    await act(async () => {
      await Promise.all([
        result.current.dismiss('lesson-inquiry:b'),
        result.current.dismiss('lesson-inquiry:a'),
      ]);
    });
    expect(keys(result.current.inboxState)).toEqual([
      'lesson-inquiry:b',
      'lesson-inquiry:c',
    ]);
    expect(result.current.dismissError).toMatch(/Couldn't mark that done/);

    act(() => result.current.clearDismissError());
    expect(result.current.dismissError).toBeNull();
  });
});
