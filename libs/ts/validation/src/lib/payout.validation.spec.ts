import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { payoutValidation } from './payout.validation';
import type { GeneratePayoutInput } from '@maple/ts/domain';

describe('payoutValidation', () => {
  const now = new Date('2026-01-15T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const validPayout: GeneratePayoutInput = {
    artistId: 'artist-123',
    periodStart: new Date('2026-01-01T00:00:00Z'),
    periodEnd: new Date('2026-01-14T23:59:59Z'),
  };

  describe('valid data', () => {
    it('passes with all required fields', () => {
      const result = payoutValidation(validPayout);
      expect(result.isValid()).toBe(true);
    });
  });

  describe('artistId field', () => {
    it('fails when artistId is missing', () => {
      const result = payoutValidation({
        ...validPayout,
        artistId: '',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('artistId')).toContain('Artist is required');
    });
  });

  describe('periodStart field', () => {
    it('fails when periodStart is missing', () => {
      const result = payoutValidation({
        ...validPayout,
        periodStart: undefined as unknown as Date,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('periodStart')).toContain(
        'Period start date is required'
      );
    });
  });

  describe('periodEnd field', () => {
    it('fails when periodEnd is missing', () => {
      const result = payoutValidation({
        ...validPayout,
        periodEnd: undefined as unknown as Date,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('periodEnd')).toContain(
        'Period end date is required'
      );
    });
  });

  describe('cross-field validation', () => {
    it('fails when end date is before start date', () => {
      const result = payoutValidation({
        ...validPayout,
        periodStart: new Date('2026-01-10T00:00:00Z'),
        periodEnd: new Date('2026-01-05T00:00:00Z'),
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('periodEnd')).toContain(
        'End date must be after start date'
      );
    });

    it('fails when end date equals start date', () => {
      const sameDate = new Date('2026-01-10T00:00:00Z');
      const result = payoutValidation({
        ...validPayout,
        periodStart: sameDate,
        periodEnd: sameDate,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('periodEnd')).toContain(
        'End date must be after start date'
      );
    });

    it('fails when end date is in the future', () => {
      const result = payoutValidation({
        ...validPayout,
        periodEnd: new Date('2026-01-20T00:00:00Z'), // 5 days after "now"
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('periodEnd')).toContain(
        'End date cannot be in the future'
      );
    });

    it('passes when end date is today (not in future)', () => {
      const result = payoutValidation({
        ...validPayout,
        periodEnd: now,
      });
      expect(result.hasErrors('periodEnd')).toBe(false);
    });

    it('passes with valid date range', () => {
      const result = payoutValidation({
        ...validPayout,
        periodStart: new Date('2026-01-01T00:00:00Z'),
        periodEnd: new Date('2026-01-10T00:00:00Z'),
      });
      expect(result.isValid()).toBe(true);
    });
  });

  describe('single-field validation', () => {
    it('only validates specified field', () => {
      const invalidData = {
        artistId: '', // invalid
        periodStart: undefined as unknown as Date, // invalid
        periodEnd: undefined as unknown as Date, // invalid
      };

      const result = payoutValidation(invalidData, 'artistId');
      expect(result.hasErrors('artistId')).toBe(true);
      expect(result.hasErrors('periodStart')).toBe(false);
      expect(result.hasErrors('periodEnd')).toBe(false);
    });
  });
});
