import { describe, it, expect } from 'vitest';
import { instructorValidation } from './instructor.validation';
import type { CreateInstructorInput } from '@maple/ts/domain';

describe('instructorValidation', () => {
  const validInstructor: CreateInstructorInput = {
    name: 'Sarah Miller',
    email: 'sarah@example.com',
    phone: '555-987-6543',
    status: 'active',
    bio: 'Expert weaver with 20 years of experience.',
    specialties: ['weaving', 'natural dyeing'],
    payRate: 5000, // $50 flat rate
    payRateType: 'flat',
  };

  describe('valid data', () => {
    it('passes with all required fields', () => {
      const result = instructorValidation(validInstructor);
      expect(result.isValid()).toBe(true);
    });

    it('passes with minimal required fields', () => {
      const result = instructorValidation({
        name: 'John Smith',
        email: 'john@example.com',
        status: 'active',
      });
      expect(result.isValid()).toBe(true);
    });

    it('passes without optional fields', () => {
      const result = instructorValidation({
        ...validInstructor,
        phone: undefined,
        bio: undefined,
        specialties: undefined,
        payRate: undefined,
        payRateType: undefined,
      });
      expect(result.isValid()).toBe(true);
    });
  });

  describe('name field', () => {
    it('fails when name is missing', () => {
      const result = instructorValidation({
        ...validInstructor,
        name: '',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('name')).toContain('Name is required');
    });

    it('fails when name is too short', () => {
      const result = instructorValidation({
        ...validInstructor,
        name: 'A',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('name')).toContain(
        'Name must be at least 2 characters'
      );
    });

    it('passes with 2-character name', () => {
      const result = instructorValidation({
        ...validInstructor,
        name: 'Jo',
      });
      expect(result.hasErrors('name')).toBe(false);
    });
  });

  describe('email field', () => {
    it('fails when email is missing', () => {
      const result = instructorValidation({
        ...validInstructor,
        email: '',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('email')).toContain('Email is required');
    });

    it('fails when email format is invalid', () => {
      const result = instructorValidation({
        ...validInstructor,
        email: 'not-an-email',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('email')).toContain('Email must be valid');
    });

    it('passes with valid email', () => {
      const result = instructorValidation({
        ...validInstructor,
        email: 'instructor@workshop.org',
      });
      expect(result.hasErrors('email')).toBe(false);
    });
  });

  describe('phone field', () => {
    it('passes when phone is undefined (optional)', () => {
      const result = instructorValidation({
        ...validInstructor,
        phone: undefined,
      });
      expect(result.hasErrors('phone')).toBe(false);
    });

    it('fails when phone format is invalid', () => {
      const result = instructorValidation({
        ...validInstructor,
        phone: 'invalid-phone!',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('phone')).toContain(
        'Phone must be valid if provided'
      );
    });

    it('passes with valid phone formats', () => {
      const validPhones = ['555-123-4567', '(555) 123-4567', '+1 555 123 4567'];
      validPhones.forEach((phone) => {
        const result = instructorValidation({ ...validInstructor, phone });
        expect(result.hasErrors('phone')).toBe(false);
      });
    });
  });

  describe('status field', () => {
    it('fails when status is missing', () => {
      const result = instructorValidation({
        ...validInstructor,
        status: '' as 'active',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('status')).toContain('Status is required');
    });

    it('fails when status is invalid', () => {
      const result = instructorValidation({
        ...validInstructor,
        status: 'invalid' as 'active',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('status')).toContain(
        'Status must be active or inactive'
      );
    });

    it('passes with active status', () => {
      const result = instructorValidation({
        ...validInstructor,
        status: 'active',
      });
      expect(result.hasErrors('status')).toBe(false);
    });

    it('passes with inactive status', () => {
      const result = instructorValidation({
        ...validInstructor,
        status: 'inactive',
      });
      expect(result.hasErrors('status')).toBe(false);
    });
  });

  describe('bio field', () => {
    it('passes when bio is undefined (optional)', () => {
      const result = instructorValidation({
        ...validInstructor,
        bio: undefined,
      });
      expect(result.hasErrors('bio')).toBe(false);
    });

    it('fails when bio exceeds 2000 characters', () => {
      const result = instructorValidation({
        ...validInstructor,
        bio: 'a'.repeat(2001),
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('bio')).toContain(
        'Bio must be less than 2000 characters'
      );
    });

    it('passes with bio at 2000 characters', () => {
      const result = instructorValidation({
        ...validInstructor,
        bio: 'a'.repeat(2000),
      });
      expect(result.hasErrors('bio')).toBe(false);
    });
  });

  describe('specialties field', () => {
    it('passes when specialties is undefined (optional)', () => {
      const result = instructorValidation({
        ...validInstructor,
        specialties: undefined,
      });
      expect(result.hasErrors('specialties')).toBe(false);
    });

    it('passes with empty array', () => {
      const result = instructorValidation({
        ...validInstructor,
        specialties: [],
      });
      expect(result.hasErrors('specialties')).toBe(false);
    });

    it('fails when specialty is too short', () => {
      const result = instructorValidation({
        ...validInstructor,
        specialties: ['a'],
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('specialties')).toContain(
        'Each specialty must be at least 2 characters'
      );
    });

    it('passes with valid specialties', () => {
      const result = instructorValidation({
        ...validInstructor,
        specialties: ['weaving', 'pottery', 'woodworking'],
      });
      expect(result.hasErrors('specialties')).toBe(false);
    });
  });

  describe('payRate and payRateType fields', () => {
    it('passes when payRate is undefined (optional)', () => {
      const result = instructorValidation({
        ...validInstructor,
        payRate: undefined,
        payRateType: undefined,
      });
      expect(result.hasErrors('payRate')).toBe(false);
      expect(result.hasErrors('payRateType')).toBe(false);
    });

    it('passes when payRate and payRateType are null (JSON serialization)', () => {
      // JSON serialization converts undefined to null
      const result = instructorValidation({
        ...validInstructor,
        payRate: null as unknown as undefined,
        payRateType: null as unknown as undefined,
      });
      expect(result.hasErrors('payRate')).toBe(false);
      expect(result.hasErrors('payRateType')).toBe(false);
    });

    it('fails when payRateType is set but payRate is missing', () => {
      const result = instructorValidation({
        ...validInstructor,
        payRate: undefined,
        payRateType: 'flat',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('payRate')).toContain(
        'Pay rate is required when pay rate type is set'
      );
    });

    it('fails when payRate is negative', () => {
      const result = instructorValidation({
        ...validInstructor,
        payRate: -100,
        payRateType: 'flat',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('payRate')).toContain(
        'Pay rate must be non-negative'
      );
    });

    it('fails when payRateType is invalid', () => {
      const result = instructorValidation({
        ...validInstructor,
        payRateType: 'invalid' as 'flat',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('payRateType')).toContain(
        'Pay rate type must be valid if provided'
      );
    });

    it('passes with flat rate', () => {
      const result = instructorValidation({
        ...validInstructor,
        payRate: 5000,
        payRateType: 'flat',
      });
      expect(result.hasErrors('payRate')).toBe(false);
      expect(result.hasErrors('payRateType')).toBe(false);
    });

    it('passes with hourly rate', () => {
      const result = instructorValidation({
        ...validInstructor,
        payRate: 2500,
        payRateType: 'hourly',
      });
      expect(result.hasErrors('payRate')).toBe(false);
    });

    it('fails when percentage rate exceeds 1', () => {
      const result = instructorValidation({
        ...validInstructor,
        payRate: 1.5,
        payRateType: 'percentage',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('payRate')).toContain(
        'Percentage pay rate must be between 0 and 1'
      );
    });

    it('passes with valid percentage rate', () => {
      const result = instructorValidation({
        ...validInstructor,
        payRate: 0.7,
        payRateType: 'percentage',
      });
      expect(result.hasErrors('payRate')).toBe(false);
    });
  });

  describe('single-field validation', () => {
    it('only validates specified field', () => {
      const invalidData = {
        name: '',
        email: 'invalid',
        status: '' as 'active',
      };

      const result = instructorValidation(invalidData, 'name');
      expect(result.hasErrors('name')).toBe(true);
      expect(result.hasErrors('email')).toBe(false);
      expect(result.hasErrors('status')).toBe(false);
    });
  });
});
