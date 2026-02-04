import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { discountValidation } from './discount.validation';
import type { DiscountValidationInput } from './discount.validation';

describe('discountValidation', () => {
  const futureDate = new Date('2030-06-15T00:00:00Z');

  const validPercent: DiscountValidationInput = {
    type: 'percent',
    code: 'SAVE10',
    description: '10% off your registration',
    status: 'active',
    percent: 10,
  };

  const validAmount: DiscountValidationInput = {
    type: 'amount',
    code: 'FIVER',
    description: '$5 off your registration',
    status: 'active',
    amountCents: 500,
  };

  const validEarlyBird: DiscountValidationInput = {
    type: 'amount-before-date',
    code: 'EARLYBIRD',
    description: '$10 off before June 15',
    status: 'active',
    amountCents: 1000,
    cutoffDate: futureDate,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('valid data', () => {
    it('passes with valid percent discount', () => {
      const result = discountValidation(validPercent);
      expect(result.isValid()).toBe(true);
    });

    it('passes with valid amount discount', () => {
      const result = discountValidation(validAmount);
      expect(result.isValid()).toBe(true);
    });

    it('passes with valid early bird discount', () => {
      const result = discountValidation(validEarlyBird);
      expect(result.isValid()).toBe(true);
    });

    it('passes with inactive status', () => {
      const result = discountValidation({
        ...validPercent,
        status: 'inactive',
      });
      expect(result.isValid()).toBe(true);
    });

    it('passes with hyphenated code', () => {
      const result = discountValidation({
        ...validPercent,
        code: 'EARLY-BIRD-2025',
      });
      expect(result.isValid()).toBe(true);
    });
  });

  describe('code field', () => {
    it('fails when code is missing', () => {
      const result = discountValidation({ ...validPercent, code: '' });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('code')).toContain('Code is required');
    });

    it('fails when code is too short', () => {
      const result = discountValidation({ ...validPercent, code: 'AB' });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('code')).toContain(
        'Code must be at least 3 characters'
      );
    });

    it('fails when code is too long', () => {
      const result = discountValidation({
        ...validPercent,
        code: 'A'.repeat(31),
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('code')).toContain(
        'Code must be less than 30 characters'
      );
    });

    it('fails when code contains invalid characters', () => {
      const result = discountValidation({
        ...validPercent,
        code: 'SAVE 10!',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('code')).toContain(
        'Code must contain only letters, numbers, and hyphens'
      );
    });

    it('passes at boundary lengths (3 and 30)', () => {
      [{ code: 'ABC' }, { code: 'A'.repeat(30) }].forEach((override) => {
        const result = discountValidation({ ...validPercent, ...override });
        expect(result.hasErrors('code')).toBe(false);
      });
    });
  });

  describe('type field', () => {
    it('fails when type is missing', () => {
      const result = discountValidation({
        ...validPercent,
        type: '' as 'percent',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('type')).toContain('Type is required');
    });

    it('fails when type is invalid', () => {
      const result = discountValidation({
        ...validPercent,
        type: 'bogo' as 'percent',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('type')).toContain('Type must be valid');
    });

    it('passes with all valid types', () => {
      const types = ['percent', 'amount', 'amount-before-date'] as const;
      types.forEach((type) => {
        let data: Partial<DiscountValidationInput>;
        if (type === 'percent') {
          data = { ...validPercent, type };
        } else if (type === 'amount') {
          data = { ...validAmount, type };
        } else {
          data = { ...validEarlyBird, type };
        }
        const result = discountValidation(data);
        expect(result.hasErrors('type')).toBe(false);
      });
    });
  });

  describe('status field', () => {
    it('fails when status is missing', () => {
      const result = discountValidation({
        ...validPercent,
        status: '' as 'active',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('status')).toContain('Status is required');
    });

    it('fails when status is invalid', () => {
      const result = discountValidation({
        ...validPercent,
        status: 'expired' as 'active',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('status')).toContain('Status must be valid');
    });

    it('passes with active and inactive', () => {
      ['active', 'inactive'].forEach((status) => {
        const result = discountValidation({
          ...validPercent,
          status: status as 'active',
        });
        expect(result.hasErrors('status')).toBe(false);
      });
    });
  });

  describe('description field', () => {
    it('fails when description is missing', () => {
      const result = discountValidation({
        ...validPercent,
        description: '',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('description')).toContain(
        'Description is required'
      );
    });

    it('fails when description exceeds 200 characters', () => {
      const result = discountValidation({
        ...validPercent,
        description: 'a'.repeat(201),
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('description')).toContain(
        'Description must be less than 200 characters'
      );
    });

    it('passes at 200 characters', () => {
      const result = discountValidation({
        ...validPercent,
        description: 'a'.repeat(200),
      });
      expect(result.hasErrors('description')).toBe(false);
    });
  });

  describe('percent field', () => {
    it('fails when percent is missing for percent type', () => {
      const result = discountValidation({
        ...validPercent,
        percent: undefined as unknown as number,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('percent')).toContain(
        'Percent is required for percent discounts'
      );
    });

    it('fails when percent is 0', () => {
      const result = discountValidation({
        ...validPercent,
        percent: 0,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('percent')).toContain(
        'Percent must be between 1 and 100'
      );
    });

    it('fails when percent exceeds 100', () => {
      const result = discountValidation({
        ...validPercent,
        percent: 101,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('percent')).toContain(
        'Percent must be between 1 and 100'
      );
    });

    it('passes at boundary values 1 and 100', () => {
      [1, 100].forEach((percent) => {
        const result = discountValidation({ ...validPercent, percent });
        expect(result.hasErrors('percent')).toBe(false);
      });
    });

    it('does not require percent for amount type', () => {
      const result = discountValidation(validAmount);
      expect(result.hasErrors('percent')).toBe(false);
    });
  });

  describe('amountCents field', () => {
    it('fails when amountCents is missing for amount type', () => {
      const result = discountValidation({
        ...validAmount,
        amountCents: undefined as unknown as number,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('amountCents')).toContain(
        'Amount is required for amount discounts'
      );
    });

    it('fails when amountCents is missing for amount-before-date type', () => {
      const result = discountValidation({
        ...validEarlyBird,
        amountCents: undefined as unknown as number,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('amountCents')).toContain(
        'Amount is required for amount discounts'
      );
    });

    it('fails when amountCents is 0', () => {
      const result = discountValidation({
        ...validAmount,
        amountCents: 0,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('amountCents')).toContain(
        'Amount must be greater than $0'
      );
    });

    it('fails when amountCents exceeds $10,000', () => {
      const result = discountValidation({
        ...validAmount,
        amountCents: 1000001,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('amountCents')).toContain(
        'Amount cannot exceed $10,000'
      );
    });

    it('passes at boundary value $10,000 (1000000 cents)', () => {
      const result = discountValidation({
        ...validAmount,
        amountCents: 1000000,
      });
      expect(result.hasErrors('amountCents')).toBe(false);
    });

    it('does not require amountCents for percent type', () => {
      const result = discountValidation(validPercent);
      expect(result.hasErrors('amountCents')).toBe(false);
    });
  });

  describe('cutoffDate field', () => {
    it('fails when cutoffDate is missing for amount-before-date type', () => {
      const result = discountValidation({
        ...validEarlyBird,
        cutoffDate: undefined as unknown as Date,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('cutoffDate')).toContain(
        'Cutoff date is required for early bird discounts'
      );
    });

    it('fails when cutoffDate is in the past', () => {
      const result = discountValidation({
        ...validEarlyBird,
        cutoffDate: new Date('2020-01-01'),
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('cutoffDate')).toContain(
        'Cutoff date must be in the future'
      );
    });

    it('passes with future cutoffDate', () => {
      const result = discountValidation(validEarlyBird);
      expect(result.hasErrors('cutoffDate')).toBe(false);
    });

    it('does not require cutoffDate for percent type', () => {
      const result = discountValidation(validPercent);
      expect(result.hasErrors('cutoffDate')).toBe(false);
    });

    it('does not require cutoffDate for amount type', () => {
      const result = discountValidation(validAmount);
      expect(result.hasErrors('cutoffDate')).toBe(false);
    });
  });

  describe('single-field validation', () => {
    it('only validates specified field', () => {
      const invalidData = {
        type: '' as 'percent',
        code: '',
        description: '',
        status: '' as 'active',
        percent: -5,
      };

      const result = discountValidation(invalidData, 'code');
      expect(result.hasErrors('code')).toBe(true);
      expect(result.hasErrors('type')).toBe(false);
      expect(result.hasErrors('description')).toBe(false);
    });
  });
});
