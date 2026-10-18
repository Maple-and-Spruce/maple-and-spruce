import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  httpsCallable: vi.fn(),
  httpsCallableFromURL: vi.fn(),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: mocks.httpsCallable,
  httpsCallableFromURL: mocks.httpsCallableFromURL,
}));

vi.mock('@maple/ts/firebase/firebase-config', () => ({
  getMapleFunctions: () => 'functions',
  routerCallableUrl: (router: string, route: string) =>
    `https://fn.test/${router}/${route}`,
}));

import { callDeduped } from './call-deduped';

/** A callable whose result we release by hand, so calls can overlap. */
function pendingCallable() {
  let resolve!: (v: unknown) => void;
  const call = vi.fn(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  return { call, resolve: (v: unknown) => resolve(v) };
}

describe('callDeduped', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls a standalone function by name', async () => {
    const callable = vi.fn().mockResolvedValue({ data: 'ok' });
    mocks.httpsCallable.mockReturnValue(callable);

    await expect(callDeduped('getClasses', {})).resolves.toEqual({
      data: 'ok',
    });
    expect(mocks.httpsCallable).toHaveBeenCalledWith('functions', 'getClasses');
    expect(mocks.httpsCallableFromURL).not.toHaveBeenCalled();
  });

  it('calls a router route by its URL (ADR-029)', async () => {
    const callable = vi.fn().mockResolvedValue({ data: 'ok' });
    mocks.httpsCallableFromURL.mockReturnValue(callable);

    await callDeduped({ router: 'products', route: 'getProducts' }, {});

    expect(mocks.httpsCallableFromURL).toHaveBeenCalledWith(
      'functions',
      'https://fn.test/products/getProducts'
    );
    expect(mocks.httpsCallable).not.toHaveBeenCalled();
  });

  it('shares one in-flight request between overlapping identical route reads', async () => {
    const pending = pendingCallable();
    mocks.httpsCallableFromURL.mockReturnValue(pending.call);
    const target = { router: 'products', route: 'getProducts' };

    const first = callDeduped(target, {});
    const second = callDeduped(target, {});
    pending.resolve({ data: 'shared' });

    await expect(first).resolves.toEqual({ data: 'shared' });
    await expect(second).resolves.toEqual({ data: 'shared' });
    expect(pending.call).toHaveBeenCalledTimes(1);
  });

  it('keeps a route apart from a standalone function of the same name', async () => {
    const routeCall = pendingCallable();
    const nameCall = pendingCallable();
    mocks.httpsCallableFromURL.mockReturnValue(routeCall.call);
    mocks.httpsCallable.mockReturnValue(nameCall.call);

    const viaRoute = callDeduped(
      { router: 'products', route: 'getProducts' },
      {}
    );
    const viaName = callDeduped('getProducts', {});
    routeCall.resolve({ data: 'route' });
    nameCall.resolve({ data: 'name' });

    await expect(viaRoute).resolves.toEqual({ data: 'route' });
    await expect(viaName).resolves.toEqual({ data: 'name' });
  });

  it('forgets a request once it settles', async () => {
    const callable = vi.fn().mockResolvedValue({ data: 'ok' });
    mocks.httpsCallableFromURL.mockReturnValue(callable);
    const target = { router: 'products', route: 'getProducts' };

    await callDeduped(target, {});
    await callDeduped(target, {});

    expect(callable).toHaveBeenCalledTimes(2);
  });
});
