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
  kind: 'student-autoinvoice-off',
  id: 'student-1',
  label: 'Test Student',
  detail: 'Lessons will not bill automatically',
  resolution: 'inline',
};

function attentionResponse(total: number) {
  return {
    data: {
      groups:
        total === 0
          ? []
          : [
              {
                kind: 'student-autoinvoice-off',
                title: 'Students who will not bill automatically',
                because: 'Every future lesson has to be invoiced by hand.',
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

  it("routes the inline fix through the page's own updateStudent when given one", async () => {
    const updateStudent = vi.fn().mockResolvedValue({});
    const { result } = renderHook(() => useNeedsAttention({ updateStudent }));
    await waitFor(() =>
      expect(result.current.attentionState.status).toBe('success')
    );

    await act(() => result.current.resolveRow(row));

    expect(updateStudent).toHaveBeenCalledWith({
      id: 'student-1',
      autoInvoice: true,
    });
    expect(mocks.callables.updateStudent).not.toHaveBeenCalled();
  });

  it('falls back to the updateStudent callable on pages without a roster', async () => {
    const { result } = renderHook(() => useNeedsAttention());
    await waitFor(() =>
      expect(result.current.attentionState.status).toBe('success')
    );

    await act(() => result.current.resolveRow(row));

    expect(mocks.callables.updateStudent).toHaveBeenCalledWith({
      id: 'student-1',
      autoInvoice: true,
    });
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

    let resolving: Promise<void> = Promise.resolve();
    act(() => {
      resolving = result.current.resolveRow(row);
    });
    await waitFor(() =>
      expect(mocks.callables.getNeedsAttention).toHaveBeenCalledTimes(2)
    );
    expect(result.current.attentionState.status).toBe('success');

    await act(async () => {
      finishRefresh(attentionResponse(0));
      await resolving;
    });
    expect(result.current.attentionState).toMatchObject({
      status: 'success',
      data: { total: 0 },
    });
  });
});
