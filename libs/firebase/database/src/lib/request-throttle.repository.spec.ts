import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  refs: [] as string[],
}));

vi.mock('./utilities/database.config', () => {
  const tx = {
    get: async (ref: { id: string }) => ({
      exists: state.docs.has(ref.id),
      data: () => state.docs.get(ref.id),
    }),
    set: (ref: { id: string }, data: Record<string, unknown>) => {
      state.docs.set(ref.id, data);
    },
  };
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => {
        state.refs.push(`${name}/${id}`);
        return { id };
      },
    }),
    runTransaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  return { getDb: () => db };
});

import {
  RequestThrottleRepository,
  REQUEST_THROTTLE_RETENTION_MS,
  throttleWindowStart,
} from './request-throttle.repository';

describe('throttleWindowStart', () => {
  it('floors to the window boundary', () => {
    expect(throttleWindowStart(3_599_999, 3600)).toBe(0);
    expect(throttleWindowStart(3_600_000, 3600)).toBe(3_600_000);
    expect(throttleWindowStart(4_000_000, 600)).toBe(3_600_000);
  });
});

describe('RequestThrottleRepository.hit', () => {
  const now = 10 * 3_600_000 + 123;

  beforeEach(() => {
    state.docs.clear();
    state.refs = [];
  });

  it('counts per bucket per window and refuses past the limit', async () => {
    const results = [];
    for (let i = 0; i < 3; i++) {
      results.push(await RequestThrottleRepository.hit('b', 2, 3600, now));
    }
    expect(results).toEqual([
      { allowed: true, count: 1 },
      { allowed: true, count: 2 },
      { allowed: false, count: 3 },
    ]);
    expect(state.refs[0]).toBe(`requestThrottles/b:${10 * 3_600_000}`);
  });

  it('writes a TTL expiry after the window closes', async () => {
    await RequestThrottleRepository.hit('b', 2, 3600, now);
    const doc = state.docs.get(`b:${10 * 3_600_000}`)!;
    expect(doc['expiresAt']).toEqual(
      new Date(11 * 3_600_000 + REQUEST_THROTTLE_RETENTION_MS)
    );
    expect(doc['windowStart']).toEqual(new Date(10 * 3_600_000));
  });

  it('starts over in the next window', async () => {
    await RequestThrottleRepository.hit('b', 1, 3600, now);
    const next = await RequestThrottleRepository.hit(
      'b',
      1,
      3600,
      now + 3_600_000
    );
    expect(next).toEqual({ allowed: true, count: 1 });
  });
});
