import { describe, it, expect } from 'vitest';
import { classCategoryValidation } from './class-category.validation';
import type { CreateClassCategoryInput } from '@maple/ts/domain';

describe('classCategoryValidation', () => {
  const validCategory: CreateClassCategoryInput = {
    name: 'Fiber Arts',
    description: 'Weaving, knitting, and textile arts',
    order: 0,
    icon: '🧶',
  };

  describe('valid data', () => {
    it('passes with all fields', () => {
      const result = classCategoryValidation(validCategory);
      expect(result.isValid()).toBe(true);
    });

    it('passes with minimal required fields', () => {
      const result = classCategoryValidation({
        name: 'Pottery',
        order: 10,
      });
      expect(result.isValid()).toBe(true);
    });

    it('passes without optional fields', () => {
      const result = classCategoryValidation({
        ...validCategory,
        description: undefined,
        icon: undefined,
      });
      expect(result.isValid()).toBe(true);
    });
  });

  describe('name field', () => {
    it('fails when name is missing', () => {
      const result = classCategoryValidation({
        ...validCategory,
        name: '',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('name')).toContain('Name is required');
    });

    it('fails when name is too short', () => {
      const result = classCategoryValidation({
        ...validCategory,
        name: 'A',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('name')).toContain(
        'Name must be at least 2 characters'
      );
    });

    it('fails when name exceeds 50 characters', () => {
      const result = classCategoryValidation({
        ...validCategory,
        name: 'a'.repeat(51),
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('name')).toContain(
        'Name must be at most 50 characters'
      );
    });

    it('passes with 2-character name', () => {
      const result = classCategoryValidation({
        ...validCategory,
        name: 'Ab',
      });
      expect(result.hasErrors('name')).toBe(false);
    });

    it('passes with 50-character name', () => {
      const result = classCategoryValidation({
        ...validCategory,
        name: 'a'.repeat(50),
      });
      expect(result.hasErrors('name')).toBe(false);
    });
  });

  describe('order field', () => {
    it('fails when order is missing', () => {
      const result = classCategoryValidation({
        ...validCategory,
        order: undefined as unknown as number,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('order')).toContain('Display order is required');
    });

    it('fails when order is negative', () => {
      const result = classCategoryValidation({
        ...validCategory,
        order: -1,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('order')).toContain(
        'Display order must be non-negative'
      );
    });

    it('passes with order of 0', () => {
      const result = classCategoryValidation({
        ...validCategory,
        order: 0,
      });
      expect(result.hasErrors('order')).toBe(false);
    });

    it('passes with large order values', () => {
      const result = classCategoryValidation({
        ...validCategory,
        order: 100,
      });
      expect(result.hasErrors('order')).toBe(false);
    });
  });

  describe('description field', () => {
    it('passes when description is undefined (optional)', () => {
      const result = classCategoryValidation({
        ...validCategory,
        description: undefined,
      });
      expect(result.hasErrors('description')).toBe(false);
    });

    it('passes when description is empty', () => {
      const result = classCategoryValidation({
        ...validCategory,
        description: '',
      });
      expect(result.hasErrors('description')).toBe(false);
    });

    it('fails when description exceeds 200 characters', () => {
      const result = classCategoryValidation({
        ...validCategory,
        description: 'a'.repeat(201),
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('description')).toContain(
        'Description must be at most 200 characters'
      );
    });

    it('passes with description at 200 characters', () => {
      const result = classCategoryValidation({
        ...validCategory,
        description: 'a'.repeat(200),
      });
      expect(result.hasErrors('description')).toBe(false);
    });
  });

  describe('single-field validation', () => {
    it('only validates specified field', () => {
      const invalidData = {
        name: '',
        order: -1,
        description: 'a'.repeat(201),
      };

      const result = classCategoryValidation(invalidData, 'name');
      expect(result.hasErrors('name')).toBe(true);
      expect(result.hasErrors('order')).toBe(false);
      expect(result.hasErrors('description')).toBe(false);
    });
  });
});
