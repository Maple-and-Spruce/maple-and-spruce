import { describe, it, expect } from 'vitest';
import { registrationValidation } from './registration.validation';
import type { RegistrationValidationInput } from './registration.validation';

describe('registrationValidation', () => {
  const validRegistration: RegistrationValidationInput = {
    classId: 'class-123',
    customerName: 'Jane Doe',
    customerEmail: 'jane@example.com',
    customerPhone: '(304) 555-1234',
    quantity: 1,
    notes: 'No allergies',
  };

  describe('valid data', () => {
    it('passes with all fields', () => {
      const result = registrationValidation(validRegistration);
      expect(result.isValid()).toBe(true);
    });

    it('passes with minimal required fields', () => {
      const result = registrationValidation({
        classId: 'class-123',
        customerName: 'Jane Doe',
        customerEmail: 'jane@example.com',
        quantity: 1,
      });
      expect(result.isValid()).toBe(true);
    });

    it('passes without optional phone and notes', () => {
      const result = registrationValidation({
        ...validRegistration,
        customerPhone: undefined,
        notes: undefined,
      });
      expect(result.isValid()).toBe(true);
    });
  });

  describe('classId field', () => {
    it('fails when classId is missing', () => {
      const result = registrationValidation({
        ...validRegistration,
        classId: '',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('classId')).toContain('Class is required');
    });
  });

  describe('customerName field', () => {
    it('fails when name is missing', () => {
      const result = registrationValidation({
        ...validRegistration,
        customerName: '',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('customerName')).toContain('Name is required');
    });

    it('fails when name is too short', () => {
      const result = registrationValidation({
        ...validRegistration,
        customerName: 'J',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('customerName')).toContain(
        'Name must be at least 2 characters'
      );
    });

    it('fails when name is too long', () => {
      const result = registrationValidation({
        ...validRegistration,
        customerName: 'a'.repeat(100),
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('customerName')).toContain(
        'Name must be less than 100 characters'
      );
    });

    it('passes at boundary length 2', () => {
      const result = registrationValidation({
        ...validRegistration,
        customerName: 'Jo',
      });
      expect(result.hasErrors('customerName')).toBe(false);
    });
  });

  describe('customerEmail field', () => {
    it('fails when email is missing', () => {
      const result = registrationValidation({
        ...validRegistration,
        customerEmail: '',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('customerEmail')).toContain('Email is required');
    });

    it('fails when email is invalid', () => {
      const result = registrationValidation({
        ...validRegistration,
        customerEmail: 'not-an-email',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('customerEmail')).toContain(
        'Email must be a valid email address'
      );
    });

    it('passes with valid email formats', () => {
      const validEmails = [
        'user@example.com',
        'user.name@domain.org',
        'user+tag@example.co.uk',
      ];
      validEmails.forEach((email) => {
        const result = registrationValidation({
          ...validRegistration,
          customerEmail: email,
        });
        expect(result.hasErrors('customerEmail')).toBe(false);
      });
    });
  });

  describe('customerPhone field', () => {
    it('passes when phone is undefined (optional)', () => {
      const result = registrationValidation({
        ...validRegistration,
        customerPhone: undefined,
      });
      expect(result.hasErrors('customerPhone')).toBe(false);
    });

    it('fails when phone is invalid', () => {
      const result = registrationValidation({
        ...validRegistration,
        customerPhone: 'abc',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('customerPhone')).toContain(
        'Phone number must be valid'
      );
    });

    it('passes with valid phone formats', () => {
      const validPhones = [
        '3045551234',
        '(304) 555-1234',
        '304-555-1234',
        '+1 304 555 1234',
      ];
      validPhones.forEach((phone) => {
        const result = registrationValidation({
          ...validRegistration,
          customerPhone: phone,
        });
        expect(result.hasErrors('customerPhone')).toBe(false);
      });
    });
  });

  describe('quantity field', () => {
    it('fails when quantity is missing', () => {
      const result = registrationValidation({
        ...validRegistration,
        quantity: undefined,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('quantity')).toContain('Quantity is required');
    });

    it('fails when quantity is 0', () => {
      const result = registrationValidation({
        ...validRegistration,
        quantity: 0,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('quantity')).toContain(
        'Quantity must be at least 1'
      );
    });

    it('fails when quantity exceeds 10', () => {
      const result = registrationValidation({
        ...validRegistration,
        quantity: 11,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('quantity')).toContain(
        'Quantity cannot exceed 10'
      );
    });

    it('passes at boundary values 1 and 10', () => {
      [1, 10].forEach((quantity) => {
        const result = registrationValidation({
          ...validRegistration,
          quantity,
        });
        expect(result.hasErrors('quantity')).toBe(false);
      });
    });
  });

  describe('notes field', () => {
    it('passes when notes is undefined (optional)', () => {
      const result = registrationValidation({
        ...validRegistration,
        notes: undefined,
      });
      expect(result.hasErrors('notes')).toBe(false);
    });

    it('fails when notes exceeds 500 characters', () => {
      const result = registrationValidation({
        ...validRegistration,
        notes: 'a'.repeat(501),
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('notes')).toContain(
        'Notes must be less than 500 characters'
      );
    });

    it('passes at 500 characters', () => {
      const result = registrationValidation({
        ...validRegistration,
        notes: 'a'.repeat(500),
      });
      expect(result.hasErrors('notes')).toBe(false);
    });
  });

  describe('single-field validation', () => {
    it('only validates specified field', () => {
      const invalidData: RegistrationValidationInput = {
        classId: '',
        customerName: '',
        customerEmail: '',
        quantity: 0,
      };

      const result = registrationValidation(invalidData, 'customerName');
      expect(result.hasErrors('customerName')).toBe(true);
      expect(result.hasErrors('classId')).toBe(false);
      expect(result.hasErrors('customerEmail')).toBe(false);
    });
  });
});
