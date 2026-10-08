import { describe, expect, it } from 'vitest';
import { resolveHopeLessonRate, type HopeProduct } from './hope-product';

const product = (over: Partial<HopeProduct> = {}): HopeProduct => ({
  id: 'prod-1',
  emaProductId: '103772',
  name: 'Suzuki Violin Lesson - 30 min',
  priceCents: 3250,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe('resolveHopeLessonRate', () => {
  const products = new Map([['prod-1', product()]]);

  it("is the student's EMA product price", () => {
    expect(
      resolveHopeLessonRate({ hopeProductId: 'prod-1' }, products)
    ).toMatchObject({ rateCents: 3250, source: 'product' });
  });

  it('still uses a retired product: it is what past lessons were billed at', () => {
    const retired = new Map([['prod-1', product({ active: false })]]);
    expect(
      resolveHopeLessonRate({ hopeProductId: 'prod-1' }, retired).rateCents
    ).toBe(3250);
  });

  it('has no price at all with no product: nothing in code stands in', () => {
    // Before #83 part 3 this was $41.25 from a length table EMA never used.
    expect(resolveHopeLessonRate({}, products)).toEqual({ source: 'unpriced' });
  });

  it('treats a product that no longer exists as no product', () => {
    expect(
      resolveHopeLessonRate({ hopeProductId: 'deleted' }, products)
    ).toEqual({ source: 'unpriced' });
  });

  it('is unpriced when there are no products to look in', () => {
    expect(
      resolveHopeLessonRate({ hopeProductId: 'prod-1' }, new Map()).rateCents
    ).toBeUndefined();
  });
});
