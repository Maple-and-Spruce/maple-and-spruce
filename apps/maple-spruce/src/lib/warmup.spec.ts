import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  httpsCallable: vi.fn(),
  httpsCallableFromURL: vi.fn(),
  call: vi.fn(),
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

import { DASHBOARD_WARMUP_FUNCTIONS, warmupDashboard } from './warmup';

describe('warmupDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.call.mockResolvedValue({ data: { warm: true } });
    mocks.httpsCallable.mockReturnValue(mocks.call);
    mocks.httpsCallableFromURL.mockReturnValue(mocks.call);
  });

  it('sends the warmup sentinel once per target', () => {
    warmupDashboard();

    expect(mocks.call).toHaveBeenCalledTimes(DASHBOARD_WARMUP_FUNCTIONS.length);
    expect(mocks.call).toHaveBeenCalledWith({ __warmup: true });
  });

  it('warms standalone functions by name and router routes by URL', () => {
    warmupDashboard();

    expect(mocks.httpsCallable).toHaveBeenCalledWith('functions', 'getClasses');
    expect(mocks.httpsCallableFromURL).toHaveBeenCalledWith(
      'functions',
      'https://fn.test/products/getProducts'
    );
  });

  it('swallows a failed warmup', async () => {
    mocks.call.mockRejectedValue(new Error('cold and cross'));

    expect(() => warmupDashboard()).not.toThrow();
    await Promise.resolve();
  });
});
