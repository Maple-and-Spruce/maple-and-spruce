/**
 * Discount validation suite
 *
 * Vest validation for discount admin forms.
 * Validates common fields plus type-specific fields based on discount type.
 *
 * @see https://vestjs.dev/
 */
import { create, test, enforce, only } from 'vest';
import { DISCOUNT_TYPES, DISCOUNT_STATUSES } from '@maple/ts/domain';
import type { DiscountType, DiscountStatus } from '@maple/ts/domain';

/**
 * Flat input shape for validation.
 * Uses a flat object instead of the discriminated union CreateDiscountInput
 * so that Vest can access all possible fields regardless of type.
 */
export interface DiscountValidationInput {
  code?: string;
  type?: DiscountType;
  status?: DiscountStatus;
  description?: string;
  percent?: number;
  amountCents?: number;
  cutoffDate?: Date;
}

/**
 * Validate discount form data
 *
 * @param data - Partial discount data to validate
 * @param field - Optional field to validate (for single-field validation)
 */
export const discountValidation = create(
  (data: DiscountValidationInput, field?: string) => {
    only(field);

    // Code validation
    test('code', 'Code is required', () => {
      enforce(data.code).isNotBlank();
    });

    test('code', 'Code must be at least 3 characters', () => {
      enforce(data.code).longerThanOrEquals(3);
    });

    test('code', 'Code must be less than 30 characters', () => {
      enforce(data.code).shorterThanOrEquals(30);
    });

    test('code', 'Code must contain only letters, numbers, and hyphens', () => {
      if (data.code) {
        enforce(data.code).matches(/^[A-Za-z0-9-]+$/);
      }
    });

    // Type validation
    test('type', 'Type is required', () => {
      enforce(data.type).isNotBlank();
    });

    test('type', 'Type must be valid', () => {
      if (data.type) {
        enforce(data.type).inside(DISCOUNT_TYPES);
      }
    });

    // Status validation
    test('status', 'Status is required', () => {
      enforce(data.status).isNotBlank();
    });

    test('status', 'Status must be valid', () => {
      if (data.status) {
        enforce(data.status).inside(DISCOUNT_STATUSES);
      }
    });

    // Description validation
    test('description', 'Description is required', () => {
      enforce(data.description).isNotBlank();
    });

    test('description', 'Description must be less than 200 characters', () => {
      if (data.description) {
        enforce(data.description).shorterThanOrEquals(200);
      }
    });

    // Percent validation (only for percent type)
    test('percent', 'Percent is required for percent discounts', () => {
      if (data.type === 'percent') {
        enforce(data.percent).isNotNullish();
      }
    });

    test('percent', 'Percent must be between 1 and 100', () => {
      if (
        data.type === 'percent' &&
        data.percent !== undefined &&
        data.percent !== null
      ) {
        enforce(data.percent).greaterThanOrEquals(1);
        enforce(data.percent).lessThanOrEquals(100);
      }
    });

    // Amount validation (for amount and amount-before-date types)
    test('amountCents', 'Amount is required for amount discounts', () => {
      if (data.type === 'amount' || data.type === 'amount-before-date') {
        enforce(data.amountCents).isNotNullish();
      }
    });

    test('amountCents', 'Amount must be greater than $0', () => {
      if (
        (data.type === 'amount' || data.type === 'amount-before-date') &&
        data.amountCents !== undefined &&
        data.amountCents !== null
      ) {
        enforce(data.amountCents).greaterThan(0);
      }
    });

    test('amountCents', 'Amount cannot exceed $10,000', () => {
      if (
        (data.type === 'amount' || data.type === 'amount-before-date') &&
        data.amountCents !== undefined &&
        data.amountCents !== null
      ) {
        enforce(data.amountCents).lessThanOrEquals(1000000);
      }
    });

    // Cutoff date validation (only for amount-before-date type)
    test(
      'cutoffDate',
      'Cutoff date is required for early bird discounts',
      () => {
        if (data.type === 'amount-before-date') {
          enforce(data.cutoffDate).isNotNullish();
        }
      }
    );

    test('cutoffDate', 'Cutoff date must be in the future', () => {
      if (data.type === 'amount-before-date' && data.cutoffDate) {
        const cutoff =
          data.cutoffDate instanceof Date
            ? data.cutoffDate
            : new Date(data.cutoffDate);
        enforce(cutoff.getTime()).greaterThan(Date.now());
      }
    });
  }
);
