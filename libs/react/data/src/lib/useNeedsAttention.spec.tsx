// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { NeedsAttentionRow } from '@maple/ts/domain';

const mocks = vi.hoisted(() => ({
  callables: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: (_functions: unknown, name: string) => mocks.callables[name],
}));
vi.mock('@maple/ts/firebase/firebase-config', () => ({
  getMapleFunctions: () => ({}),
}));

import { useNeedsAttention } from './useNeedsAttention';

const row: NeedsAttentionRow = {
  kind: 'lesson-unbilled',
  id: 'lesson-1',
  label: 'Test Student',
  detail: 'Taught Mon, Oct 5 — never invoiced',
  resolution: 'navigate',
  href: '/students/student-1',
};

function attentionResponse(total: number) {
  return {
    data: {
      groups:
        total === 0
          ? []
          : [
              {
                kind: 'lesson-unbilled',
                title: 'Lessons taught but never invoiced',
                because: 'Taught, and nobody has been asked to pay for them yet.',
                rows: [row],
              },
            ],
      total,
      scopedToSelf: false,
    },
  };
}

describe('useNeedsAttention', () => {
  beforeEach(() => {
    mocks.callables = {
      getNeedsAttention: vi.fn().mockResolvedValue(attentionResponse(1)),
      updateStudent: vi.fn().mockResolvedValue({ data: {} }),
    };
  });

  it('refreshes behind a loaded panel instead of unmounting it back to loading', async () => {
    const { result } = renderHook(() => useNeedsAttention());
    await waitFor(() =>
      expect(result.current.attentionState.status).toBe('success')
    );

    let finishRefresh!: (value: unknown) => void;
    mocks.callables.getNeedsAttention.mockReturnValueOnce(
      new Promise((resolve) => {
        finishRefresh = resolve;
      })
    );

    let refreshing: Promise<void> = Promise.resolve();
    act(() => {
      refreshing = result.current.fetchAttention();
    });
    await waitFor(() =>
      expect(mocks.callables.getNeedsAttention).toHaveBeenCalledTimes(2)
    );
    expect(result.current.attentionState.status).toBe('success');

    await act(async () => {
      finishRefresh(attentionResponse(0));
      await refreshing;
    });
    expect(result.current.attentionState).toMatchObject({
      status: 'success',
      data: { total: 0 },
    });
  });
});
