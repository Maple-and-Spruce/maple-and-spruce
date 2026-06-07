import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  httpsCallable: vi.fn(),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: mocks.httpsCallable,
}));

import { warmup } from './warmup';

// `functions` is opaque to `warmup` — it's just passed through to
// httpsCallable, which is mocked. Any value works.
const fakeFunctions = {} as never;

describe('warmup() resilience — must never block or break the caller', () => {
  // The widget fires `warmup(functions, …)` on mount without awaiting it.
  // If any failure mode here escaped as an unhandled rejection or a thrown
  // error, the registration flow would break for users on a cold endpoint
  // or a network blip. These tests assert the helper is bulletproof.

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves even when one callable rejects', async () => {
    mocks.httpsCallable.mockImplementation((_fns: unknown, name: string) => {
      if (name === 'fnA') return () => Promise.reject(new Error('boom'));
      return () => Promise.resolve({ data: { warm: true } });
    });

    await expect(warmup(fakeFunctions, 'fnA', 'fnB')).resolves.toBeUndefined();
  });

  it('resolves when all callables reject', async () => {
    mocks.httpsCallable.mockReturnValue(() =>
      Promise.reject(new Error('network down'))
    );

    await expect(warmup(fakeFunctions, 'fnA', 'fnB', 'fnC')).resolves.toBeUndefined();
  });

  it('resolves when httpsCallable throws synchronously', async () => {
    // E.g. if Firebase SDK initialization failed mid-flight, httpsCallable
    // itself could throw at call time. The helper still must not reject.
    mocks.httpsCallable.mockImplementation(() => {
      throw new Error('not initialized');
    });

    await expect(warmup(fakeFunctions, 'fnA')).resolves.toBeUndefined();
  });

  it('resolves when the returned callable throws synchronously', async () => {
    mocks.httpsCallable.mockReturnValue(() => {
      throw new Error('sync throw');
    });

    await expect(warmup(fakeFunctions, 'fnA')).resolves.toBeUndefined();
  });

  it('resolves when called with no function names', async () => {
    await expect(warmup(fakeFunctions)).resolves.toBeUndefined();
    expect(mocks.httpsCallable).not.toHaveBeenCalled();
  });

  it('fires one call per function name in parallel', async () => {
    const calls: string[] = [];
    mocks.httpsCallable.mockImplementation((_fns: unknown, name: string) => {
      calls.push(name);
      return () => Promise.resolve({ data: { warm: true } });
    });

    await warmup(fakeFunctions, 'a', 'b', 'c');

    expect(calls).toEqual(['a', 'b', 'c']);
  });

  it('returns a Promise the caller can safely ignore', () => {
    mocks.httpsCallable.mockReturnValue(() => Promise.reject(new Error('x')));

    // Fire-and-forget — no await. If this threw, the widget mount effect
    // would crash. The test passes if no exception escapes this block.
    expect(() => {
      warmup(fakeFunctions, 'fnA');
    }).not.toThrow();
  });
});
