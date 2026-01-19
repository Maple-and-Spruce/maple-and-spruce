import { describe, it, expect } from 'vitest';
import { saleValidation } from './sale.validation';
import type { CreateSaleInput } from '@maple/ts/domain';

describe('saleValidation', () => {
  const validSale: CreateSaleInput = {
    productId: 'prod-123',
    artistId: 'artist-123',
    salePrice: 25.0,
    quantitySold: 1,
    commission: 7.5,
    artistEarnings: 17.5,
    commissionRateApplied: 0.3,
    source: 'square',
    soldAt: new Date(),
  };

  describe('valid data', () => {
    it('passes with all required fields', () => {
      const result = saleValidation(validSale);
      expect(result.isValid()).toBe(true);
    });

    it('passes with all valid sources', () => {
      const sources: ('etsy' | 'square' | 'manual')[] = [
        'etsy',
        'square',
        'manual',
      ];
      sources.forEach((source) => {
        const result = saleValidation({ ...validSale, source });
        expect(result.hasErrors('source')).toBe(false);
      });
    });
  });

  describe('productId field', () => {
    it('fails when productId is missing', () => {
      const result = saleValidation({
        ...validSale,
        productId: '',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('productId')).toContain('Product is required');
    });
  });

  describe('artistId field', () => {
    it('fails when artistId is missing', () => {
      const result = saleValidation({
        ...validSale,
        artistId: '',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('artistId')).toContain('Artist is required');
    });
  });

  describe('salePrice field', () => {
    it('fails when salePrice is missing', () => {
      const result = saleValidation({
        ...validSale,
        salePrice: undefined as unknown as number,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('salePrice')).toContain('Sale price is required');
    });

    it('fails when salePrice is 0', () => {
      const result = saleValidation({
        ...validSale,
        salePrice: 0,
        commission: 0,
        artistEarnings: 0,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('salePrice')).toContain(
        'Sale price must be greater than 0'
      );
    });

    it('fails when salePrice is negative', () => {
      const result = saleValidation({
        ...validSale,
        salePrice: -10,
      });
      expect(result.isValid()).toBe(false);
    });
  });

  describe('quantitySold field', () => {
    it('fails when quantitySold is missing', () => {
      const result = saleValidation({
        ...validSale,
        quantitySold: undefined as unknown as number,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('quantitySold')).toContain(
        'Quantity sold is required'
      );
    });

    it('fails when quantitySold is 0', () => {
      const result = saleValidation({
        ...validSale,
        quantitySold: 0,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('quantitySold')).toContain(
        'Quantity sold must be at least 1'
      );
    });

    it('fails when quantitySold is not a whole number', () => {
      const result = saleValidation({
        ...validSale,
        quantitySold: 1.5,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('quantitySold')).toContain(
        'Quantity sold must be a whole number'
      );
    });

    it('passes with quantity of 1', () => {
      const result = saleValidation({
        ...validSale,
        quantitySold: 1,
      });
      expect(result.hasErrors('quantitySold')).toBe(false);
    });

    it('passes with larger quantities', () => {
      const result = saleValidation({
        ...validSale,
        quantitySold: 10,
      });
      expect(result.hasErrors('quantitySold')).toBe(false);
    });
  });

  describe('commission field', () => {
    it('fails when commission is missing', () => {
      const result = saleValidation({
        ...validSale,
        commission: undefined as unknown as number,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('commission')).toContain('Commission is required');
    });

    it('fails when commission is negative', () => {
      const result = saleValidation({
        ...validSale,
        commission: -5,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('commission')).toContain(
        'Commission must be non-negative'
      );
    });

    it('passes with 0 commission', () => {
      const result = saleValidation({
        ...validSale,
        commission: 0,
        artistEarnings: 25.0,
        commissionRateApplied: 0,
      });
      expect(result.hasErrors('commission')).toBe(false);
    });
  });

  describe('artistEarnings field', () => {
    it('fails when artistEarnings is missing', () => {
      const result = saleValidation({
        ...validSale,
        artistEarnings: undefined as unknown as number,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('artistEarnings')).toContain(
        'Artist earnings is required'
      );
    });

    it('fails when artistEarnings is negative', () => {
      const result = saleValidation({
        ...validSale,
        artistEarnings: -10,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('artistEarnings')).toContain(
        'Artist earnings must be non-negative'
      );
    });
  });

  describe('commissionRateApplied field', () => {
    it('fails when commissionRateApplied is missing', () => {
      const result = saleValidation({
        ...validSale,
        commissionRateApplied: undefined as unknown as number,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('commissionRateApplied')).toContain(
        'Commission rate is required'
      );
    });

    it('fails when commissionRateApplied is negative', () => {
      const result = saleValidation({
        ...validSale,
        commissionRateApplied: -0.1,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('commissionRateApplied')).toContain(
        'Commission rate must be between 0 and 1'
      );
    });

    it('fails when commissionRateApplied exceeds 1', () => {
      const result = saleValidation({
        ...validSale,
        commissionRateApplied: 1.5,
      });
      expect(result.isValid()).toBe(false);
    });

    it('passes with boundary values 0 and 1', () => {
      [0, 1].forEach((rate) => {
        const result = saleValidation({
          ...validSale,
          commissionRateApplied: rate,
          commission: validSale.salePrice * rate,
          artistEarnings: validSale.salePrice * (1 - rate),
        });
        expect(result.hasErrors('commissionRateApplied')).toBe(false);
      });
    });
  });

  describe('source field', () => {
    it('fails when source is missing', () => {
      const result = saleValidation({
        ...validSale,
        source: '' as 'square',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('source')).toContain('Sale source is required');
    });

    it('fails when source is invalid', () => {
      const result = saleValidation({
        ...validSale,
        source: 'invalid' as 'square',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('source')).toContain(
        'Sale source must be etsy, square, or manual'
      );
    });
  });

  describe('soldAt field', () => {
    it('fails when soldAt is missing', () => {
      const result = saleValidation({
        ...validSale,
        soldAt: undefined as unknown as Date,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('soldAt')).toContain('Sale date is required');
    });
  });

  describe('cross-field validation', () => {
    it('fails when commission + earnings does not equal sale price', () => {
      const result = saleValidation({
        ...validSale,
        salePrice: 25.0,
        commission: 5.0,
        artistEarnings: 15.0, // 5 + 15 = 20, not 25
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('commission')).toContain(
        'Commission + earnings must equal sale price'
      );
    });

    it('passes when commission + earnings equals sale price', () => {
      const result = saleValidation({
        salePrice: 100.0,
        commission: 30.0,
        artistEarnings: 70.0,
        productId: 'prod-123',
        artistId: 'artist-123',
        quantitySold: 1,
        commissionRateApplied: 0.3,
        source: 'square',
        soldAt: new Date(),
      });
      expect(result.hasErrors('commission')).toBe(false);
    });
  });

  describe('single-field validation', () => {
    it('only validates specified field', () => {
      const invalidData = {
        productId: '', // invalid
        artistId: '', // invalid
        salePrice: 0, // invalid
        quantitySold: 0, // invalid
        commission: -1, // invalid
        artistEarnings: -1, // invalid
        commissionRateApplied: 2, // invalid
        source: '' as 'square', // invalid
        soldAt: new Date(),
      };

      const result = saleValidation(invalidData, 'productId');
      expect(result.hasErrors('productId')).toBe(true);
      expect(result.hasErrors('artistId')).toBe(false);
      expect(result.hasErrors('salePrice')).toBe(false);
    });
  });
});
