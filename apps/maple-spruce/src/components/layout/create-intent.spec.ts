// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
let search = '';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/classes',
  useSearchParams: () => new URLSearchParams(search),
}));

import {
  createIntentHref,
  hasCreateIntent,
  useCreateIntent,
  withoutCreateIntent,
} from './create-intent';

describe('create intent URLs', () => {
  it('builds the intent link', () => {
    expect(createIntentHref('/classes')).toBe('/classes?new=1');
  });

  it('detects the intent only when set to 1', () => {
    expect(hasCreateIntent(new URLSearchParams('new=1'))).toBe(true);
    expect(hasCreateIntent(new URLSearchParams('new=0'))).toBe(false);
    expect(hasCreateIntent(new URLSearchParams(''))).toBe(false);
    expect(hasCreateIntent(null)).toBe(false);
  });

  it('strips the intent and keeps every other param', () => {
    expect(withoutCreateIntent('/payouts', new URLSearchParams('new=1'))).toBe(
      '/payouts',
    );
    expect(
      withoutCreateIntent('/payouts', new URLSearchParams('tab=classes&new=1')),
    ).toBe('/payouts?tab=classes');
    expect(withoutCreateIntent('/x', null)).toBe('/x');
  });
});

describe('useCreateIntent', () => {
  beforeEach(() => {
    replace.mockClear();
    search = '';
  });

  it('opens the form and clears the param when the intent is present', () => {
    search = 'new=1&tab=a';
    const onCreate = vi.fn();
    renderHook(() => useCreateIntent(onCreate));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/classes?tab=a', { scroll: false });
  });

  it('does nothing without the intent', () => {
    const onCreate = vi.fn();
    renderHook(() => useCreateIntent(onCreate));
    expect(onCreate).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('waits until the page is ready, then fires once', () => {
    search = 'new=1';
    const onCreate = vi.fn();
    const { rerender } = renderHook(
      ({ ready }) => useCreateIntent(onCreate, ready),
      { initialProps: { ready: false } },
    );
    expect(onCreate).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();

    rerender({ ready: true });
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/classes', { scroll: false });
  });

  it('calls the latest handler, not the one from first render', () => {
    search = 'new=1';
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = renderHook(
      ({ cb, ready }) => useCreateIntent(cb, ready),
      { initialProps: { cb: first, ready: false } },
    );
    rerender({ cb: latest, ready: true });
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });
});
