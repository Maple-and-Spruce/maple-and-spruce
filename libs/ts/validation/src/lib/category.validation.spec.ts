import { describe, it, expect } from 'vitest';
import { categoryValidation } from './category.validation';
import type { CreateCategoryInput } from '@maple/ts/domain';

describe('categoryValidation', () => {
  const validCategory: CreateCategoryInput = {
    name: 'Pottery',
    description: 'Handmade ceramic items',
    order: 0,
  };

  describe('valid data', () => {
    it('passes with all required fields', () => {
      const result = categoryValidation(validCategory);
      expect(result.isValid()).toBe(true);
    });

    it('passes without optional description', () => {
      const result = categoryValidation({
        name: 'Pottery',
        order: 0,
      });
      expect(result.isValid()).toBe(true);
    });
  });

  describe('name field', () => {
    it('fails when name is missing', () => {
      const result = categoryValidation({
        ...validCategory,
        name: '',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('name')).toContain('Name is required');
    });

    it('fails when name is too short', () => {
      const result = categoryValidation({
        ...validCategory,
        name: 'A',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('name')).toContain(
        'Name must be at least 2 characters'
      );
    });

    it('fails when name exceeds 50 characters', () => {
      const result = categoryValidation({
        ...validCategory,
        name: 'A'.repeat(51),
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('name')).toContain(
        'Name must be at most 50 characters'
      );
    });

    it('passes with 2-character name', () => {
      const result = categoryValidation({
        ...validCategory,
        name: 'AB',
      });
      expect(result.hasErrors('name')).toBe(false);
    });

    it('passes with 50-character name', () => {
      const result = categoryValidation({
        ...validCategory,
        name: 'A'.repeat(50),
      });
      expect(result.hasErrors('name')).toBe(false);
    });
  });

  describe('description field', () => {
    it('passes when description is empty (optional)', () => {
      const result = categoryValidation({
        ...validCategory,
        description: '',
      });
      expect(result.hasErrors('description')).toBe(false);
    });

    it('passes when description is undefined (optional)', () => {
      const result = categoryValidation({
        ...validCategory,
        description: undefined,
      });
      expect(result.hasErrors('description')).toBe(false);
    });

    it('fails when description exceeds 200 characters', () => {
      const result = categoryValidation({
        ...validCategory,
        description: 'A'.repeat(201),
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('description')).toContain(
        'Description must be at most 200 characters'
      );
    });

    it('passes with 200-character description', () => {
      const result = categoryValidation({
        ...validCategory,
        description: 'A'.repeat(200),
      });
      expect(result.hasErrors('description')).toBe(false);
    });
  });

  describe('order field', () => {
    it('fails when order is missing', () => {
      const result = categoryValidation({
        ...validCategory,
        order: undefined as unknown as number,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('order')).toContain('Display order is required');
    });

    it('fails when order is negative', () => {
      const result = categoryValidation({
        ...validCategory,
        order: -1,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('order')).toContain(
        'Display order must be a non-negative number'
      );
    });

    it('passes with 0 order', () => {
      const result = categoryValidation({
        ...validCategory,
        order: 0,
      });
      expect(result.hasErrors('order')).toBe(false);
    });

    it('passes with positive order', () => {
      const result = categoryValidation({
        ...validCategory,
        order: 10,
      });
      expect(result.hasErrors('order')).toBe(false);
    });
  });

  describe('single-field validation', () => {
    it('only validates specified field', () => {
      const invalidData = {
        name: '', // invalid
        description: 'A'.repeat(201), // invalid
        order: -1, // invalid
      };

      const result = categoryValidation(invalidData, 'name');
      expect(result.hasErrors('name')).toBe(true);
      expect(result.hasErrors('description')).toBe(false);
      expect(result.hasErrors('order')).toBe(false);
    });

  });
});
