import { describe, expect, it } from 'vitest';
import { hopeProductValidation } from './hope-product.validation';

const valid = {
  emaProductId: '103772',
  name: 'Suzuki Violin Lesson - 30 min',
  priceCents: 3250,
  active: true,
};

describe('hopeProductValidation', () => {
  it('accepts a product as it reads in the portal', () => {
    expect(hopeProductValidation(valid).hasErrors()).toBe(false);
  });

  it('requires the EMA product ID and a name', () => {
    const result = hopeProductValidation({ ...valid, emaProductId: ' ', name: '' });
    expect(result.hasErrors('emaProductId')).toBe(true);
    expect(result.hasErrors('name')).toBe(true);
  });

  it('refuses a zero, negative or fractional-cent price', () => {
    for (const priceCents of [0, -100, 32.5]) {
      expect(
        hopeProductValidation({ ...valid, priceCents }).hasErrors('priceCents')
      ).toBe(true);
    }
  });
});
