/**
 * Payout validation suite
 *
 * Vest validation for payout generation forms.
 * @see https://vestjs.dev/
 */
import { create, test, enforce, only } from 'vest';
import type { GeneratePayoutInput } from '@maple/ts/domain';

/**
 * Validate payout generation input
 *
 * @param data - Partial payout generation data to validate
 * @param field - Optional field to validate (for single-field validation)
 *
 * @example
 * const result = payoutValidation(formData);
 * if (result.isValid()) {
 *   // Generate payout
 * }
 */
export const payoutValidation = create(
  (data: Partial<GeneratePayoutInput>, field?: string) => {
    only(field);

    test('artistId', 'Artist is required', () => {
      enforce(data.artistId).isNotBlank();
    });

    test('periodStart', 'Period start date is required', () => {
      enforce(data.periodStart).isNotNullish();
    });

    test('periodEnd', 'Period end date is required', () => {
      enforce(data.periodEnd).isNotNullish();
    });

    // Cross-field validation: end date must be after start date
    test('periodEnd', 'End date must be after start date', () => {
      if (data.periodStart && data.periodEnd) {
        const start = data.periodStart.getTime();
        const end = data.periodEnd.getTime();
        enforce(end).greaterThan(start);
      }
    });

    // End date cannot be in the future
    test('periodEnd', 'End date cannot be in the future', () => {
      if (data.periodEnd) {
        const now = new Date().getTime();
        const end = data.periodEnd.getTime();
        enforce(end).lessThanOrEquals(now);
      }
    });
  }
);
