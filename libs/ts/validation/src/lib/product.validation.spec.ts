import { describe, it, expect } from 'vitest';
import { productValidation } from './product.validation';
import type { CreateProductInput } from '@maple/ts/domain';

describe('productValidation', () => {
  const validProduct: CreateProductInput = {
    artistId: 'artist-123',
    status: 'active',
    name: 'Handmade Pottery Bowl',
    priceCents: 2500,
    quantity: 5,
  };

  describe('valid data', () => {
    it('passes with all required fields', () => {
      const result = productValidation(validProduct);
      expect(result.isValid()).toBe(true);
    });

    it('passes with optional fields', () => {
      const result = productValidation({
        ...validProduct,
        categoryId: 'cat-123',
        customCommissionRate: 0.25,
        description: 'A beautiful handmade bowl',
      });
      expect(result.isValid()).toBe(true);
    });
  });

  describe('artistId field', () => {
    it('fails when artistId is missing', () => {
      const result = productValidation({
        ...validProduct,
        artistId: '',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('artistId')).toContain('Artist is required');
    });
  });

  describe('status field', () => {
    it('fails when status is missing', () => {
      const result = productValidation({
        ...validProduct,
        status: '' as 'active',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('status')).toContain('Status is required');
    });

    it('fails when status is invalid', () => {
      const result = productValidation({
        ...validProduct,
        status: 'invalid' as 'active',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('status')).toContain(
        'Status must be active, draft, or discontinued'
      );
    });

    it('passes with all valid statuses', () => {
      const validStatuses: ('active' | 'draft' | 'discontinued')[] = [
        'active',
        'draft',
        'discontinued',
      ];
      validStatuses.forEach((status) => {
        const result = productValidation({ ...validProduct, status });
        expect(result.hasErrors('status')).toBe(false);
      });
    });
  });

  describe('customCommissionRate field', () => {
    it('passes when commission rate is undefined (optional)', () => {
      const result = productValidation({
        ...validProduct,
        customCommissionRate: undefined,
      });
      expect(result.hasErrors('customCommissionRate')).toBe(false);
    });

    it('fails when commission rate is negative', () => {
      const result = productValidation({
        ...validProduct,
        customCommissionRate: -0.1,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('customCommissionRate')).toContain(
        'Commission rate must be between 0 and 1'
      );
    });

    it('fails when commission rate exceeds 1', () => {
      const result = productValidation({
        ...validProduct,
        customCommissionRate: 1.5,
      });
      expect(result.isValid()).toBe(false);
    });

    it('passes with boundary values 0 and 1', () => {
      [0, 1].forEach((rate) => {
        const result = productValidation({
          ...validProduct,
          customCommissionRate: rate,
        });
        expect(result.hasErrors('customCommissionRate')).toBe(false);
      });
    });
  });

  describe('name field', () => {
    it('fails when name is missing', () => {
      const result = productValidation({
        ...validProduct,
        name: '',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('name')).toContain('Name is required');
    });

    it('fails when name is too short', () => {
      const result = productValidation({
        ...validProduct,
        name: 'A',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('name')).toContain(
        'Name must be at least 2 characters'
      );
    });

    it('passes with 2-character name', () => {
      const result = productValidation({
        ...validProduct,
        name: 'AB',
      });
      expect(result.hasErrors('name')).toBe(false);
    });
  });

  describe('priceCents field', () => {
    it('fails when price is missing', () => {
      const result = productValidation({
        ...validProduct,
        priceCents: undefined as unknown as number,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('priceCents')).toContain('Price is required');
    });

    it('fails when price is 0', () => {
      const result = productValidation({
        ...validProduct,
        priceCents: 0,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('priceCents')).toContain(
        'Price must be greater than 0'
      );
    });

    it('fails when price is negative', () => {
      const result = productValidation({
        ...validProduct,
        priceCents: -100,
      });
      expect(result.isValid()).toBe(false);
    });

    it('fails when price exceeds $100,000', () => {
      const result = productValidation({
        ...validProduct,
        priceCents: 10000001, // $100,000.01
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('priceCents')).toContain(
        'Price cannot exceed $100,000'
      );
    });

    it('passes with maximum allowed price ($100,000)', () => {
      const result = productValidation({
        ...validProduct,
        priceCents: 10000000, // $100,000.00
      });
      expect(result.hasErrors('priceCents')).toBe(false);
    });

    it('passes with minimum valid price (1 cent)', () => {
      const result = productValidation({
        ...validProduct,
        priceCents: 1,
      });
      expect(result.hasErrors('priceCents')).toBe(false);
    });
  });

  describe('quantity field', () => {
    it('fails when quantity is missing', () => {
      const result = productValidation({
        ...validProduct,
        quantity: undefined as unknown as number,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('quantity')).toContain('Quantity is required');
    });

    it('fails when quantity is negative', () => {
      const result = productValidation({
        ...validProduct,
        quantity: -1,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('quantity')).toContain(
        'Quantity must be 0 or greater'
      );
    });

    it('fails when quantity is not a whole number', () => {
      const result = productValidation({
        ...validProduct,
        quantity: 2.5,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('quantity')).toContain(
        'Quantity must be a whole number'
      );
    });

    it('passes with 0 quantity', () => {
      const result = productValidation({
        ...validProduct,
        quantity: 0,
      });
      expect(result.hasErrors('quantity')).toBe(false);
    });

    it('passes with positive whole number', () => {
      const result = productValidation({
        ...validProduct,
        quantity: 100,
      });
      expect(result.hasErrors('quantity')).toBe(false);
    });
  });

  describe('single-field validation', () => {
    it('only validates specified field', () => {
      const invalidData = {
        artistId: '', // invalid
        status: '' as 'active', // invalid
        name: '', // invalid
        priceCents: 0, // invalid
        quantity: -1, // invalid
      };

      const result = productValidation(invalidData, 'name');
      expect(result.hasErrors('name')).toBe(true);
      expect(result.hasErrors('artistId')).toBe(false);
      expect(result.hasErrors('priceCents')).toBe(false);
    });

  });
});
