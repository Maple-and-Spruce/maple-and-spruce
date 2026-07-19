import { describe, it, expect } from 'vitest';
import { studentValidation } from './student.validation';
import type { CreateStudentInput } from '@maple/ts/domain';

describe('studentValidation', () => {
  const validStudent: CreateStudentInput = {
    name: 'Olive Thompson',
    instrument: 'violin',
    isAdultStudent: false,
    primaryTeacherId: 'instructor-abc',
    registeredLessonLength: '30-min-initial',
    isHopeScholarship: false,
    primaryContactName: 'Rita Thompson',
    primaryContactEmail: 'rita@example.com',
    primaryContactPhone: '555-111-2222',
    status: 'active',
    notes: 'Loves Twinkle variations.',
  };

  describe('valid data', () => {
    it('passes with all fields populated', () => {
      const result = studentValidation(validStudent);
      expect(result.isValid()).toBe(true);
    });

    it('passes with only required fields', () => {
      const result = studentValidation({
        name: 'Minimal Student',
        instrument: 'piano',
        isAdultStudent: true,
        primaryTeacherId: 'instructor-xyz',
        isHopeScholarship: false,
        primaryContactName: 'Minimal Student',
        primaryContactEmail: 'minimal@example.com',
        status: 'active',
      });
      expect(result.isValid()).toBe(true);
    });

    it('passes without optional fields', () => {
      const result = studentValidation({
        ...validStudent,
        primaryContactPhone: undefined,
        secondaryContactEmail: undefined,
        secondaryContactPhone: undefined,
        registeredLessonLength: undefined,
        notes: undefined,
      });
      expect(result.isValid()).toBe(true);
    });
  });

  describe('name field', () => {
    it('fails when missing', () => {
      const result = studentValidation({ ...validStudent, name: '' });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('name')).toContain('Student name is required');
    });

    it('fails when too short', () => {
      const result = studentValidation({ ...validStudent, name: 'A' });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('name')).toContain(
        'Student name must be at least 2 characters'
      );
    });
  });

  describe('instrument field', () => {
    it('fails when missing', () => {
      const result = studentValidation({
        ...validStudent,
        instrument: '' as 'violin',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('instrument')).toContain('Instrument is required');
    });

    it('fails when not a valid enum value', () => {
      const result = studentValidation({
        ...validStudent,
        instrument: 'harp' as 'violin',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('instrument')).toContain(
        'Instrument must be a valid option'
      );
    });

    it('accepts each supported instrument', () => {
      const supported = [
        'piano',
        'guitar',
        'violin',
        'viola',
        'cello',
        'bass',
        'voice',
        'ukulele',
        'mandolin',
        'banjo',
        'fiddle',
        'flute',
        'other',
      ] as const;

      for (const instrument of supported) {
        const result = studentValidation({ ...validStudent, instrument });
        expect(result.hasErrors('instrument')).toBe(false);
      }
    });
  });

  describe('primaryTeacherId field', () => {
    it('fails when missing', () => {
      const result = studentValidation({
        ...validStudent,
        primaryTeacherId: '',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('primaryTeacherId')).toContain(
        'Primary teacher is required'
      );
    });
  });

  describe('lessonRateCents field', () => {
    it('passes when undefined (optional)', () => {
      const result = studentValidation({
        ...validStudent,
        lessonRateCents: undefined,
      });
      expect(result.hasErrors('lessonRateCents')).toBe(false);
    });

    it('accepts a positive whole number of cents', () => {
      const result = studentValidation({
        ...validStudent,
        lessonRateCents: 4125,
      });
      expect(result.hasErrors('lessonRateCents')).toBe(false);
    });

    it('rejects zero and negative amounts', () => {
      expect(
        studentValidation({ ...validStudent, lessonRateCents: 0 }).isValid()
      ).toBe(false);
      expect(
        studentValidation({ ...validStudent, lessonRateCents: -100 }).isValid()
      ).toBe(false);
    });

    it('rejects a fractional cent amount', () => {
      const result = studentValidation({
        ...validStudent,
        lessonRateCents: 41.25,
      });
      expect(result.isValid()).toBe(false);
    });
  });

  describe('venmoUsername field', () => {
    it('passes when undefined (optional)', () => {
      const result = studentValidation({
        ...validStudent,
        venmoUsername: undefined,
      });
      expect(result.hasErrors('venmoUsername')).toBe(false);
    });

    it('accepts a valid handle', () => {
      const result = studentValidation({
        ...validStudent,
        venmoUsername: 'casey-nguyen',
      });
      expect(result.hasErrors('venmoUsername')).toBe(false);
    });

    it('tolerates a leading @', () => {
      const result = studentValidation({
        ...validStudent,
        venmoUsername: '@casey_nguyen',
      });
      expect(result.hasErrors('venmoUsername')).toBe(false);
    });

    it('fails when too short', () => {
      const result = studentValidation({
        ...validStudent,
        venmoUsername: 'abc',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('venmoUsername').length).toBeGreaterThan(0);
    });

    it('fails on illegal characters', () => {
      const result = studentValidation({
        ...validStudent,
        venmoUsername: 'has spaces!',
      });
      expect(result.isValid()).toBe(false);
    });
  });

  describe('registeredLessonLength field', () => {
    it('passes when undefined', () => {
      const result = studentValidation({
        ...validStudent,
        registeredLessonLength: undefined,
      });
      expect(result.hasErrors('registeredLessonLength')).toBe(false);
    });

    it('fails when not a valid option', () => {
      const result = studentValidation({
        ...validStudent,
        registeredLessonLength: '90-min' as '30-min-initial',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('registeredLessonLength')).toContain(
        'Registered lesson length must be valid if provided'
      );
    });

    it('accepts each supported length', () => {
      const lengths = [
        '30-min-initial',
        '30-min-full',
        '45-min',
        '60-min',
      ] as const;
      for (const registeredLessonLength of lengths) {
        const result = studentValidation({
          ...validStudent,
          registeredLessonLength,
        });
        expect(result.hasErrors('registeredLessonLength')).toBe(false);
      }
    });
  });

  describe('primary contact fields', () => {
    it('fails when primaryContactName is missing', () => {
      const result = studentValidation({
        ...validStudent,
        primaryContactName: '',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('primaryContactName')).toContain(
        'Primary contact name is required'
      );
    });

    it('fails when primaryContactEmail is missing', () => {
      const result = studentValidation({
        ...validStudent,
        primaryContactEmail: '',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('primaryContactEmail')).toContain(
        'Primary contact email is required'
      );
    });

    it('fails when primaryContactEmail is malformed', () => {
      const result = studentValidation({
        ...validStudent,
        primaryContactEmail: 'not-an-email',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('primaryContactEmail')).toContain(
        'Primary contact email must be valid'
      );
    });

    it('fails when primaryContactPhone has letters', () => {
      const result = studentValidation({
        ...validStudent,
        primaryContactPhone: 'no-phone-here!',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('primaryContactPhone')).toContain(
        'Primary contact phone must be valid if provided'
      );
    });

    it('accepts common phone formats', () => {
      const phones = ['555-123-4567', '(555) 123-4567', '+1 555 123 4567'];
      for (const primaryContactPhone of phones) {
        const result = studentValidation({
          ...validStudent,
          primaryContactPhone,
        });
        expect(result.hasErrors('primaryContactPhone')).toBe(false);
      }
    });
  });

  describe('secondary contact fields', () => {
    it('passes when undefined', () => {
      const result = studentValidation({
        ...validStudent,
        secondaryContactEmail: undefined,
        secondaryContactPhone: undefined,
      });
      expect(result.hasErrors('secondaryContactEmail')).toBe(false);
      expect(result.hasErrors('secondaryContactPhone')).toBe(false);
    });

    it('fails when secondaryContactEmail is malformed', () => {
      const result = studentValidation({
        ...validStudent,
        secondaryContactEmail: 'bad',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('secondaryContactEmail')).toContain(
        'Secondary contact email must be valid if provided'
      );
    });

    it('fails when secondaryContactPhone has letters', () => {
      const result = studentValidation({
        ...validStudent,
        secondaryContactPhone: 'nope',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('secondaryContactPhone')).toContain(
        'Secondary contact phone must be valid if provided'
      );
    });
  });

  describe('status field', () => {
    it('fails when missing', () => {
      const result = studentValidation({
        ...validStudent,
        status: '' as 'active',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('status')).toContain('Status is required');
    });

    it('fails when invalid', () => {
      const result = studentValidation({
        ...validStudent,
        status: 'archived' as 'active',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('status')).toContain(
        'Status must be active or inactive'
      );
    });

    it('passes with active', () => {
      const result = studentValidation({ ...validStudent, status: 'active' });
      expect(result.hasErrors('status')).toBe(false);
    });

    it('passes with inactive', () => {
      const result = studentValidation({ ...validStudent, status: 'inactive' });
      expect(result.hasErrors('status')).toBe(false);
    });
  });

  describe('notes field', () => {
    it('passes when undefined', () => {
      const result = studentValidation({ ...validStudent, notes: undefined });
      expect(result.hasErrors('notes')).toBe(false);
    });

    it('fails when exceeds 2000 characters', () => {
      const result = studentValidation({
        ...validStudent,
        notes: 'a'.repeat(2001),
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('notes')).toContain(
        'Notes must be less than 2000 characters'
      );
    });

    it('passes at exactly 2000 characters', () => {
      const result = studentValidation({
        ...validStudent,
        notes: 'a'.repeat(2000),
      });
      expect(result.hasErrors('notes')).toBe(false);
    });
  });

  describe('single-field validation', () => {
    it('only validates the specified field', () => {
      const invalidData = {
        name: '',
        instrument: '' as 'violin',
        primaryTeacherId: '',
      };
      const result = studentValidation(invalidData, 'name');
      expect(result.hasErrors('name')).toBe(true);
      expect(result.hasErrors('instrument')).toBe(false);
      expect(result.hasErrors('primaryTeacherId')).toBe(false);
    });
  });
});
