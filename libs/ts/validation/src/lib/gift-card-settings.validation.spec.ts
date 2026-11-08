import { describe, it, expect } from 'vitest';
import { DEFAULT_GIFT_CARD_AMOUNT_SETTINGS } from '@maple/ts/domain';
import {
  giftCardSettingsValidation,
  type GiftCardSettingsValidationInput,
} from './gift-card-settings.validation';

const valid: GiftCardSettingsValidationInput = {
  presetCents: [2500, 5000, 10000],
  minCents: 1000,
  maxCents: 50000,
};

function errorsFor(input: GiftCardSettingsValidationInput): Record<string, string[]> {
  return giftCardSettingsValidation(input).getErrors();
}

describe('giftCardSettingsValidation (#309)', () => {
  it('passes the shipped defaults', () => {
    expect(giftCardSettingsValidation(DEFAULT_GIFT_CARD_AMOUNT_SETTINGS).hasErrors()).toBe(false);
  });

  it('passes the widest range Settings allows, with four amounts', () => {
    expect(
      errorsFor({ presetCents: [500, 2500, 50000, 100000], minCents: 500, maxCents: 100000 })
    ).toEqual({});
  });

  it('refuses a lowest amount under $5', () => {
    expect(errorsFor({ ...valid, minCents: 400, presetCents: [2500] })['minCents']).toEqual([
      'The lowest amount must be at least $5',
    ]);
  });

  it('refuses a highest amount over $1,000', () => {
    expect(errorsFor({ ...valid, maxCents: 100100 })['maxCents']).toEqual([
      'The highest amount can be at most $1000',
    ]);
  });

  it.each([1050, 10.5, undefined, '1000'])('refuses a lowest amount of %s', (minCents) => {
    expect(errorsFor({ ...valid, minCents })).toHaveProperty('minCents');
  });

  it('needs the highest above the lowest', () => {
    expect(errorsFor({ ...valid, minCents: 5000, maxCents: 5000, presetCents: [5000] })[
      'maxCents'
    ]).toEqual(['The highest amount must be more than the lowest']);
  });

  it.each([
    [[], 'Offer 1 to 4 amounts'],
    [[1000, 2000, 3000, 4000, 5000], 'Offer 1 to 4 amounts'],
    [[2550], 'Each amount must be in whole dollars'],
    [[2500, 2500], 'Each amount can be offered once'],
    [[60000], 'Each amount must be between the lowest and the highest'],
    [[500], 'Each amount must be between the lowest and the highest'],
  ])('refuses presets %j', (presetCents, message) => {
    expect(errorsFor({ ...valid, presetCents })['presetCents']).toContain(message);
  });

  it('refuses presets that are not a list', () => {
    expect(errorsFor({ ...valid, presetCents: 2500 })).toHaveProperty('presetCents');
  });
});
