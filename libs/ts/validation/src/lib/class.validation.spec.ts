import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { classValidation } from './class.validation';
import type { CreateClassInput } from '@maple/ts/domain';

describe('classValidation', () => {
  // Use fixed date for consistent testing
  const futureDate = new Date('2030-06-15T14:00:00Z');
  const futureDate2 = new Date('2030-06-22T14:00:00Z');
  const pastDate = new Date('2020-01-01T10:00:00Z');

  const validClass: CreateClassInput = {
    name: 'Introduction to Weaving',
    description: 'Learn the basics of weaving in this hands-on workshop.',
    shortDescription: 'A beginner-friendly weaving workshop.',
    instructorId: 'instructor-123',
    sessions: [{ dateTime: futureDate }],
    durationMinutes: 120,
    capacity: 8,
    priceCents: 4500, // $45
    skillLevel: 'beginner',
    status: 'draft',
    location: 'Maple & Spruce Workshop',
    materialsIncluded: 'Loom, yarn, shuttle',
    whatToBring: 'Notebook, scissors',
  };

  beforeEach(() => {
    // Mock Date.now() for consistent future date validation
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('valid data', () => {
    it('passes with all required fields', () => {
      const result = classValidation(validClass);
      expect(result.isValid()).toBe(true);
    });

    it('passes with minimal required fields', () => {
      const result = classValidation({
        name: 'Basic Pottery',
        description: 'Learn pottery basics in this introductory class.',
        sessions: [{ dateTime: futureDate }],
        durationMinutes: 60,
        capacity: 10,
        priceCents: 3500,
        skillLevel: 'beginner',
        status: 'draft',
      });
      expect(result.isValid()).toBe(true);
    });

    it('passes with free class (price = 0)', () => {
      const result = classValidation({
        ...validClass,
        priceCents: 0,
      });
      expect(result.isValid()).toBe(true);
    });
  });

  describe('name field', () => {
    it('fails when name is missing', () => {
      const result = classValidation({
        ...validClass,
        name: '',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('name')).toContain('Name is required');
    });

    it('fails when name is too short', () => {
      const result = classValidation({
        ...validClass,
        name: 'AB',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('name')).toContain(
        'Name must be at least 3 characters'
      );
    });

    it('fails when name is too long', () => {
      const result = classValidation({
        ...validClass,
        name: 'a'.repeat(100),
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('name')).toContain(
        'Name must be less than 100 characters'
      );
    });

    it('passes with valid name', () => {
      const result = classValidation({
        ...validClass,
        name: 'Advanced Basket Weaving Techniques',
      });
      expect(result.hasErrors('name')).toBe(false);
    });
  });

  describe('description field', () => {
    it('fails when description is missing', () => {
      const result = classValidation({
        ...validClass,
        description: '',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('description')).toContain(
        'Description is required'
      );
    });

    it('fails when description is too short', () => {
      const result = classValidation({
        ...validClass,
        description: 'Too short.',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('description')).toContain(
        'Description must be at least 20 characters'
      );
    });

    it('passes with description at 20 characters', () => {
      const result = classValidation({
        ...validClass,
        description: 'This is exactly 20!!',
      });
      expect(result.hasErrors('description')).toBe(false);
    });
  });

  describe('shortDescription field', () => {
    it('passes when shortDescription is undefined (optional)', () => {
      const result = classValidation({
        ...validClass,
        shortDescription: undefined,
      });
      expect(result.hasErrors('shortDescription')).toBe(false);
    });

    it('fails when shortDescription exceeds 160 characters', () => {
      const result = classValidation({
        ...validClass,
        shortDescription: 'a'.repeat(161),
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('shortDescription')).toContain(
        'Short description must be less than 160 characters'
      );
    });

    it('passes with shortDescription at 160 characters', () => {
      const result = classValidation({
        ...validClass,
        shortDescription: 'a'.repeat(160),
      });
      expect(result.hasErrors('shortDescription')).toBe(false);
    });
  });

  describe('sessions field', () => {
    it('fails when sessions is missing', () => {
      const result = classValidation({
        ...validClass,
        sessions: undefined as unknown as Array<{ dateTime: Date }>,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('sessions')).toContain(
        'At least one class date is required'
      );
    });

    it('fails when sessions is an empty array', () => {
      const result = classValidation({
        ...validClass,
        sessions: [],
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('sessions')).toContain(
        'At least one class date is required'
      );
    });

    it('fails when sessions contain past dates', () => {
      const result = classValidation({
        ...validClass,
        sessions: [{ dateTime: pastDate }],
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('sessions')).toContain(
        'All class dates must be scheduled in the future'
      );
    });

    it('fails when any session has a past date', () => {
      const result = classValidation({
        ...validClass,
        sessions: [{ dateTime: futureDate }, { dateTime: pastDate }],
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('sessions')).toContain(
        'All class dates must be scheduled in the future'
      );
    });

    it('passes with a single future session', () => {
      const result = classValidation({
        ...validClass,
        sessions: [{ dateTime: futureDate }],
      });
      expect(result.hasErrors('sessions')).toBe(false);
    });

    it('passes with multiple future sessions', () => {
      const result = classValidation({
        ...validClass,
        sessions: [{ dateTime: futureDate }, { dateTime: futureDate2 }],
      });
      expect(result.hasErrors('sessions')).toBe(false);
    });
  });

  describe('registrationClosesAt field', () => {
    it('passes when registrationClosesAt is undefined (optional)', () => {
      const result = classValidation({
        ...validClass,
        registrationClosesAt: undefined,
      });
      expect(result.hasErrors('registrationClosesAt')).toBe(false);
    });

    it('fails when registrationClosesAt is after the first session', () => {
      const result = classValidation({
        ...validClass,
        sessions: [{ dateTime: futureDate }],
        registrationClosesAt: new Date('2030-06-16T00:00:00Z'),
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('registrationClosesAt')).toContain(
        'Registration close must be before the first class session'
      );
    });

    it('passes when registrationClosesAt is before the first session', () => {
      const result = classValidation({
        ...validClass,
        sessions: [{ dateTime: futureDate }, { dateTime: futureDate2 }],
        registrationClosesAt: new Date('2030-06-14T00:00:00Z'),
      });
      expect(result.hasErrors('registrationClosesAt')).toBe(false);
    });

    it('passes when registrationClosesAt equals the first session time', () => {
      const result = classValidation({
        ...validClass,
        sessions: [{ dateTime: futureDate }],
        registrationClosesAt: new Date(futureDate.getTime()),
      });
      expect(result.hasErrors('registrationClosesAt')).toBe(false);
    });

    it('fails when registrationClosesAt is in the past', () => {
      const result = classValidation({
        ...validClass,
        registrationClosesAt: pastDate,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('registrationClosesAt')).toContain(
        'Registration close must be in the future'
      );
    });

    it('uses the earliest session when checking against multiple sessions', () => {
      // registrationClosesAt is before futureDate but after an earlier session
      const earlierSession = new Date('2030-06-10T14:00:00Z');
      const result = classValidation({
        ...validClass,
        sessions: [{ dateTime: futureDate }, { dateTime: earlierSession }],
        registrationClosesAt: new Date('2030-06-12T00:00:00Z'),
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('registrationClosesAt')).toContain(
        'Registration close must be before the first class session'
      );
    });
  });

  describe('durationMinutes field', () => {
    it('fails when duration is missing', () => {
      const result = classValidation({
        ...validClass,
        durationMinutes: undefined as unknown as number,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('durationMinutes')).toContain(
        'Duration is required'
      );
    });

    it('fails when duration is too short', () => {
      const result = classValidation({
        ...validClass,
        durationMinutes: 15,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('durationMinutes')).toContain(
        'Duration must be at least 30 minutes'
      );
    });

    it('fails when duration exceeds 8 hours', () => {
      const result = classValidation({
        ...validClass,
        durationMinutes: 500,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('durationMinutes')).toContain(
        'Duration must be less than 480 minutes (8 hours)'
      );
    });

    it('passes with boundary values 30 and 480', () => {
      [30, 480].forEach((duration) => {
        const result = classValidation({
          ...validClass,
          durationMinutes: duration,
        });
        expect(result.hasErrors('durationMinutes')).toBe(false);
      });
    });
  });

  describe('capacity field', () => {
    it('fails when capacity is missing', () => {
      const result = classValidation({
        ...validClass,
        capacity: undefined as unknown as number,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('capacity')).toContain('Capacity is required');
    });

    it('fails when capacity is 0', () => {
      const result = classValidation({
        ...validClass,
        capacity: 0,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('capacity')).toContain(
        'Capacity must be at least 1'
      );
    });

    it('fails when capacity exceeds 50', () => {
      const result = classValidation({
        ...validClass,
        capacity: 51,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('capacity')).toContain(
        'Capacity must be less than 50'
      );
    });

    it('passes with boundary values 1 and 50', () => {
      [1, 50].forEach((capacity) => {
        const result = classValidation({
          ...validClass,
          capacity,
        });
        expect(result.hasErrors('capacity')).toBe(false);
      });
    });
  });

  describe('priceCents field', () => {
    it('fails when price is missing', () => {
      const result = classValidation({
        ...validClass,
        priceCents: undefined as unknown as number,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('priceCents')).toContain('Price is required');
    });

    it('fails when price is negative', () => {
      const result = classValidation({
        ...validClass,
        priceCents: -100,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('priceCents')).toContain(
        'Price must be at least $0'
      );
    });

    it('fails when price exceeds $10,000', () => {
      const result = classValidation({
        ...validClass,
        priceCents: 1000001,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('priceCents')).toContain(
        'Price cannot exceed $10,000'
      );
    });

    it('passes with typical prices', () => {
      [0, 4500, 10000, 1000000].forEach((price) => {
        const result = classValidation({
          ...validClass,
          priceCents: price,
        });
        expect(result.hasErrors('priceCents')).toBe(false);
      });
    });
  });

  describe('skillLevel field', () => {
    it('fails when skillLevel is missing', () => {
      const result = classValidation({
        ...validClass,
        skillLevel: '' as 'beginner',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('skillLevel')).toContain(
        'Skill level is required'
      );
    });

    it('fails when skillLevel is invalid', () => {
      const result = classValidation({
        ...validClass,
        skillLevel: 'expert' as 'beginner',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('skillLevel')).toContain(
        'Skill level must be valid'
      );
    });

    it('passes with all valid skill levels', () => {
      const levels = ['beginner', 'intermediate', 'advanced', 'all-levels'] as const;
      levels.forEach((skillLevel) => {
        const result = classValidation({
          ...validClass,
          skillLevel,
        });
        expect(result.hasErrors('skillLevel')).toBe(false);
      });
    });
  });

  describe('status field', () => {
    it('fails when status is missing', () => {
      const result = classValidation({
        ...validClass,
        status: '' as 'draft',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('status')).toContain('Status is required');
    });

    it('fails when status is invalid', () => {
      const result = classValidation({
        ...validClass,
        status: 'active' as 'draft',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('status')).toContain('Status must be valid');
    });

    it('passes with all valid statuses', () => {
      const statuses = ['draft', 'published', 'cancelled', 'completed'] as const;
      statuses.forEach((status) => {
        const result = classValidation({
          ...validClass,
          status,
        });
        expect(result.hasErrors('status')).toBe(false);
      });
    });
  });

  describe('instructorId field', () => {
    it('fails when published class has no instructorId', () => {
      const result = classValidation({
        ...validClass,
        status: 'published',
        instructorId: undefined,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('instructorId')).toContain(
        'Instructor is required for published classes'
      );
    });

    it('fails when published class has empty instructorId', () => {
      const result = classValidation({
        ...validClass,
        status: 'published',
        instructorId: '',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('instructorId')).toContain(
        'Instructor is required for published classes'
      );
    });

    it('passes when published class has instructorId', () => {
      const result = classValidation({
        ...validClass,
        status: 'published',
        instructorId: 'instructor-123',
      });
      expect(result.hasErrors('instructorId')).toBe(false);
    });

    it('passes when draft class has no instructorId', () => {
      const result = classValidation({
        ...validClass,
        status: 'draft',
        instructorId: undefined,
      });
      expect(result.hasErrors('instructorId')).toBe(false);
    });

    it('passes when cancelled class has no instructorId', () => {
      const result = classValidation({
        ...validClass,
        status: 'cancelled',
        instructorId: undefined,
      });
      expect(result.hasErrors('instructorId')).toBe(false);
    });
  });

  describe('minimumAge field', () => {
    it('passes when minimumAge is undefined (optional)', () => {
      const result = classValidation({
        ...validClass,
        minimumAge: undefined,
      });
      expect(result.hasErrors('minimumAge')).toBe(false);
    });

    it('passes when minimumAge is null (optional)', () => {
      const result = classValidation({
        ...validClass,
        minimumAge: null as unknown as number,
      });
      expect(result.hasErrors('minimumAge')).toBe(false);
    });

    it('fails when minimumAge is negative', () => {
      const result = classValidation({
        ...validClass,
        minimumAge: -1,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('minimumAge')).toContain(
        'Minimum age must be between 0 and 100'
      );
    });

    it('fails when minimumAge exceeds 100', () => {
      const result = classValidation({
        ...validClass,
        minimumAge: 101,
      });
      expect(result.isValid()).toBe(false);
    });

    it('passes with boundary values 0 and 100', () => {
      [0, 100].forEach((age) => {
        const result = classValidation({
          ...validClass,
          minimumAge: age,
        });
        expect(result.hasErrors('minimumAge')).toBe(false);
      });
    });
  });

  describe('materialsIncluded field', () => {
    it('passes when materialsIncluded is undefined (optional)', () => {
      const result = classValidation({
        ...validClass,
        materialsIncluded: undefined,
      });
      expect(result.hasErrors('materialsIncluded')).toBe(false);
    });

    it('fails when materialsIncluded exceeds 500 characters', () => {
      const result = classValidation({
        ...validClass,
        materialsIncluded: 'a'.repeat(501),
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('materialsIncluded')).toContain(
        'Materials included must be less than 500 characters'
      );
    });
  });

  describe('whatToBring field', () => {
    it('passes when whatToBring is undefined (optional)', () => {
      const result = classValidation({
        ...validClass,
        whatToBring: undefined,
      });
      expect(result.hasErrors('whatToBring')).toBe(false);
    });

    it('fails when whatToBring exceeds 500 characters', () => {
      const result = classValidation({
        ...validClass,
        whatToBring: 'a'.repeat(501),
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('whatToBring')).toContain(
        'What to bring must be less than 500 characters'
      );
    });
  });

  describe('single-field validation', () => {
    it('only validates specified field', () => {
      const invalidData = {
        name: '',
        description: '',
        sessions: [{ dateTime: pastDate }],
        durationMinutes: 0,
        capacity: 0,
        priceCents: -1,
        skillLevel: '' as 'beginner',
        status: '' as 'draft',
      };

      const result = classValidation(invalidData, 'name');
      expect(result.hasErrors('name')).toBe(true);
      expect(result.hasErrors('description')).toBe(false);
      expect(result.hasErrors('capacity')).toBe(false);
    });
  });
});
