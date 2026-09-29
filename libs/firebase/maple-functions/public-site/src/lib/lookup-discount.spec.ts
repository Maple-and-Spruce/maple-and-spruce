import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ findByCode: vi.fn() }));

vi.mock('@maple/firebase/database', () => ({
  DiscountRepository: { findByCode: mocks.findByCode },
}));

import { lookupDiscount } from './lookup-discount';

// App Check and throttling are declared on the publicSite route; see
// public-site.router.spec.ts.
type Handler = (data: unknown) => Promise<{ discount?: { code: string } }>;
const handler = lookupDiscount as unknown as Handler;

const future = new Date(Date.now() + 86_400_000);

function discount(overrides: Record<string, unknown> = {}) {
  return {
    id: 'd-1',
    code: 'SPRING',
    type: 'percent',
    percent: 10,
    status: 'active',
    expiresAt: future,
    program: 'classes',
    ...overrides,
  };
}

describe('lookupDiscount', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns nothing for a missing or non-string code', async () => {
    expect(await handler({})).toEqual({ discount: undefined });
    expect(await handler({ code: 42 })).toEqual({ discount: undefined });
    expect(mocks.findByCode).not.toHaveBeenCalled();
  });

  it('returns nothing for an unknown code', async () => {
    mocks.findByCode.mockResolvedValue(undefined);
    expect(await handler({ code: 'NOPE' })).toEqual({ discount: undefined });
  });

  it('returns a valid classes code when no program is sent', async () => {
    mocks.findByCode.mockResolvedValue(discount());
    const result = await handler({ code: 'SPRING' });
    expect(result.discount?.code).toBe('SPRING');
  });

  it('hides a code scoped to the other program', async () => {
    mocks.findByCode.mockResolvedValue(
      discount({ program: 'music-together' })
    );
    expect(await handler({ code: 'SPRING', program: 'classes' })).toEqual({
      discount: undefined,
    });
  });
});
