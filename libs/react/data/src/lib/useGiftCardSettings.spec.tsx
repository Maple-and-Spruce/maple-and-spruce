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

import { useGiftCardSettings } from './useGiftCardSettings';

const settings = { presetCents: [2500, 5000, 10000], minCents: 1000, maxCents: 50000 };

describe('useGiftCardSettings (#309)', () => {
  beforeEach(() => {
    mocks.routes = {
      'settings/getGiftCardSettings': vi.fn().mockResolvedValue({ data: { settings } }),
      'settings/updateGiftCardSettings': vi.fn(async (next: unknown) => ({
        data: { settings: next },
      })),
    };
  });

  it('loads the amounts from the settings router on mount', async () => {
    const { result } = renderHook(() => useGiftCardSettings());
    await waitFor(() => expect(result.current.settingsState.status).toBe('success'));
    expect(result.current.settingsState).toEqual({ status: 'success', data: settings });
  });

  it('reports a failed load as an error', async () => {
    mocks.routes['settings/getGiftCardSettings'] = vi
      .fn()
      .mockRejectedValue(new Error('permission-denied'));
    const { result } = renderHook(() => useGiftCardSettings());
    await waitFor(() => expect(result.current.settingsState.status).toBe('error'));
    expect(result.current.settingsState).toEqual({
      status: 'error',
      error: 'permission-denied',
    });
  });

  it('saves, then shows what the server stored', async () => {
    const { result } = renderHook(() => useGiftCardSettings());
    await waitFor(() => expect(result.current.settingsState.status).toBe('success'));
    const next = { presetCents: [2000, 7500], minCents: 500, maxCents: 100000 };

    await act(async () => {
      await result.current.saveSettings(next);
    });

    expect(mocks.routes['settings/updateGiftCardSettings']).toHaveBeenCalledWith(next);
    expect(result.current.settingsState).toEqual({ status: 'success', data: next });
    expect(result.current.isSaving).toBe(false);
  });

  it('passes a refused save back to the caller', async () => {
    mocks.routes['settings/updateGiftCardSettings'] = vi
      .fn()
      .mockRejectedValue(new Error('Validation failed'));
    const { result } = renderHook(() => useGiftCardSettings());
    await waitFor(() => expect(result.current.settingsState.status).toBe('success'));
    await expect(
      act(() => result.current.saveSettings(settings).then(() => undefined))
    ).rejects.toThrow('Validation failed');
    expect(result.current.isSaving).toBe(false);
  });
});
