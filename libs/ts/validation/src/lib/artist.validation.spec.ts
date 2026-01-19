import { describe, it, expect } from 'vitest';
import { artistValidation } from './artist.validation';
import type { CreateArtistInput } from '@maple/ts/domain';

describe('artistValidation', () => {
  const validArtist: CreateArtistInput = {
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '555-123-4567',
    defaultCommissionRate: 0.3,
    status: 'active',
  };

  describe('valid data', () => {
    it('passes with all required fields', () => {
      const result = artistValidation(validArtist);
      expect(result.isValid()).toBe(true);
    });

    it('passes without optional phone', () => {
      const result = artistValidation({
        ...validArtist,
        phone: undefined,
      });
      expect(result.isValid()).toBe(true);
    });
  });

  describe('name field', () => {
    it('fails when name is missing', () => {
      const result = artistValidation({
        ...validArtist,
        name: '',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('name')).toContain('Name is required');
    });

    it('fails when name is too short', () => {
      const result = artistValidation({
        ...validArtist,
        name: 'A',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('name')).toContain(
        'Name must be at least 2 characters'
      );
    });

    it('passes with 2-character name', () => {
      const result = artistValidation({
        ...validArtist,
        name: 'Jo',
      });
      expect(result.hasErrors('name')).toBe(false);
    });
  });

  describe('email field', () => {
    it('fails when email is missing', () => {
      const result = artistValidation({
        ...validArtist,
        email: '',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('email')).toContain('Email is required');
    });

    it('fails when email format is invalid', () => {
      const result = artistValidation({
        ...validArtist,
        email: 'not-an-email',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('email')).toContain('Email must be valid');
    });

    it('fails for email without domain', () => {
      const result = artistValidation({
        ...validArtist,
        email: 'user@',
      });
      expect(result.isValid()).toBe(false);
    });

    it('passes with valid email formats', () => {
      const validEmails = [
        'user@example.com',
        'user.name@example.com',
        'user+tag@example.co.uk',
      ];
      validEmails.forEach((email) => {
        const result = artistValidation({ ...validArtist, email });
        expect(result.hasErrors('email')).toBe(false);
      });
    });
  });

  describe('phone field', () => {
    it('passes when phone is empty (optional)', () => {
      const result = artistValidation({
        ...validArtist,
        phone: '',
      });
      expect(result.hasErrors('phone')).toBe(false);
    });

    it('passes when phone is undefined (optional)', () => {
      const result = artistValidation({
        ...validArtist,
        phone: undefined,
      });
      expect(result.hasErrors('phone')).toBe(false);
    });

    it('fails when phone format is invalid', () => {
      const result = artistValidation({
        ...validArtist,
        phone: 'not-a-phone!',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('phone')).toContain(
        'Phone must be valid if provided'
      );
    });

    it('passes with various valid phone formats', () => {
      const validPhones = [
        '555-123-4567',
        '(555) 123-4567',
        '+1 555 123 4567',
        '5551234567',
      ];
      validPhones.forEach((phone) => {
        const result = artistValidation({ ...validArtist, phone });
        expect(result.hasErrors('phone')).toBe(false);
      });
    });
  });

  describe('defaultCommissionRate field', () => {
    it('fails when commission rate is missing', () => {
      const result = artistValidation({
        ...validArtist,
        defaultCommissionRate: undefined,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('defaultCommissionRate')).toContain(
        'Commission rate is required'
      );
    });

    it('fails when commission rate is negative', () => {
      const result = artistValidation({
        ...validArtist,
        defaultCommissionRate: -0.1,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('defaultCommissionRate')).toContain(
        'Commission rate must be between 0 and 1'
      );
    });

    it('fails when commission rate exceeds 1', () => {
      const result = artistValidation({
        ...validArtist,
        defaultCommissionRate: 1.5,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('defaultCommissionRate')).toContain(
        'Commission rate must be between 0 and 1'
      );
    });

    it('passes with boundary values 0 and 1', () => {
      [0, 1].forEach((rate) => {
        const result = artistValidation({
          ...validArtist,
          defaultCommissionRate: rate,
        });
        expect(result.hasErrors('defaultCommissionRate')).toBe(false);
      });
    });

    it('passes with typical commission rate', () => {
      const result = artistValidation({
        ...validArtist,
        defaultCommissionRate: 0.3,
      });
      expect(result.hasErrors('defaultCommissionRate')).toBe(false);
    });
  });

  describe('status field', () => {
    it('fails when status is missing', () => {
      const result = artistValidation({
        ...validArtist,
        status: '' as 'active',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('status')).toContain('Status is required');
    });

    it('fails when status is invalid', () => {
      const result = artistValidation({
        ...validArtist,
        status: 'invalid' as 'active',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('status')).toContain(
        'Status must be active or inactive'
      );
    });

    it('passes with active status', () => {
      const result = artistValidation({
        ...validArtist,
        status: 'active',
      });
      expect(result.hasErrors('status')).toBe(false);
    });

    it('passes with inactive status', () => {
      const result = artistValidation({
        ...validArtist,
        status: 'inactive',
      });
      expect(result.hasErrors('status')).toBe(false);
    });
  });

  describe('single-field validation', () => {
    it('only validates specified field', () => {
      const invalidData = {
        name: '', // invalid
        email: 'invalid', // invalid
        defaultCommissionRate: 2, // invalid
        status: '' as 'active', // invalid
      };

      // When validating only 'name', other errors should not appear
      const result = artistValidation(invalidData, 'name');
      expect(result.hasErrors('name')).toBe(true);
      expect(result.hasErrors('email')).toBe(false);
      expect(result.hasErrors('defaultCommissionRate')).toBe(false);
      expect(result.hasErrors('status')).toBe(false);
    });

  });
});
