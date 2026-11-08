/**
 * Gift card amount settings validation suite (#309).
 *
 * Runs on the admin Settings card and again in `settings/updateGiftCardSettings`,
 * so the buy page can never be handed amounts it cannot sell.
 *
 * @see https://vestjs.dev/
 */
import { test, enforce, only } from 'vest';
import {
  GIFT_CARD_MAX_PRESETS,
  GIFT_CARD_SETTINGS_CEILING_CENTS,
  GIFT_CARD_SETTINGS_FLOOR_CENTS,
  formatGiftCardDollars,
} from '@maple/ts/domain';
import { staticSuite } from './static-suite';

export interface GiftCardSettingsValidationInput {
  presetCents?: unknown;
  minCents?: unknown;
  maxCents?: unknown;
}

function isWholeDollars(cents: unknown): cents is number {
  return typeof cents === 'number' && Number.isInteger(cents) && cents > 0 && cents % 100 === 0;
}

export const giftCardSettingsValidation = staticSuite(
  (data: GiftCardSettingsValidationInput, field?: string | string[]) => {
    only(field);

    const { minCents, maxCents } = data;
    const presets = Array.isArray(data.presetCents) ? (data.presetCents as unknown[]) : undefined;

    test('minCents', 'Enter the lowest amount in whole dollars', () => {
      enforce(isWholeDollars(minCents)).isTruthy();
    });

    test(
      'minCents',
      `The lowest amount must be at least ${formatGiftCardDollars(GIFT_CARD_SETTINGS_FLOOR_CENTS)}`,
      () => {
        if (isWholeDollars(minCents)) {
          enforce(minCents).greaterThanOrEquals(GIFT_CARD_SETTINGS_FLOOR_CENTS);
        }
      }
    );

    test('maxCents', 'Enter the highest amount in whole dollars', () => {
      enforce(isWholeDollars(maxCents)).isTruthy();
    });

    test(
      'maxCents',
      `The highest amount can be at most ${formatGiftCardDollars(GIFT_CARD_SETTINGS_CEILING_CENTS)}`,
      () => {
        if (isWholeDollars(maxCents)) {
          enforce(maxCents).lessThanOrEquals(GIFT_CARD_SETTINGS_CEILING_CENTS);
        }
      }
    );

    test('maxCents', 'The highest amount must be more than the lowest', () => {
      if (isWholeDollars(minCents) && isWholeDollars(maxCents)) {
        enforce(maxCents).greaterThan(minCents);
      }
    });

    test('presetCents', `Offer 1 to ${GIFT_CARD_MAX_PRESETS} amounts`, () => {
      enforce(presets?.length ?? 0).isBetween(1, GIFT_CARD_MAX_PRESETS);
    });

    test('presetCents', 'Each amount must be in whole dollars', () => {
      if (presets) enforce(presets.every(isWholeDollars)).isTruthy();
    });

    test('presetCents', 'Each amount can be offered once', () => {
      if (presets) enforce(new Set(presets).size).equals(presets.length);
    });

    test('presetCents', 'Each amount must be between the lowest and the highest', () => {
      if (presets && isWholeDollars(minCents) && isWholeDollars(maxCents)) {
        enforce(
          presets.every(
            (cents) => isWholeDollars(cents) && cents >= minCents && cents <= maxCents
          )
        ).isTruthy();
      }
    });
  }
);
