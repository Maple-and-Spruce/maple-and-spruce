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
      resolveHopeLessonRate(
        { hopeProductId: 'prod-1', registeredLessonLength: '30-min-full' },
        { durationMinutes: 30 },
        products
      )
    ).toMatchObject({ rateCents: 3250, source: 'product' });
  });

  it('still uses a retired product: it is what past lessons were billed at', () => {
    const retired = new Map([['prod-1', product({ active: false })]]);
    expect(
      resolveHopeLessonRate({ hopeProductId: 'prod-1' }, { durationMinutes: 30 }, retired)
        .rateCents
    ).toBe(3250);
  });

  it('falls back to the length table, marked as an estimate, with no product', () => {
    expect(
      resolveHopeLessonRate(
        { registeredLessonLength: '30-min-full' },
        { durationMinutes: 30 },
        products
      )
    ).toEqual({ rateCents: 4125, source: 'estimate' });
  });

  it('treats a product that no longer exists as no product', () => {
    expect(
      resolveHopeLessonRate(
        { hopeProductId: 'deleted' },
        { durationMinutes: 60 },
        products
      )
    ).toEqual({ rateCents: 7500, source: 'estimate' });
  });
});
