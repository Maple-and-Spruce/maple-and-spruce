import { describe, it, expect } from 'vitest';
import { calendarEventValidation } from './calendar-event.validation';
import type { CreateCalendarEventInput } from '@maple/ts/domain';

describe('calendarEventValidation', () => {
  const validEvent: CreateCalendarEventInput = {
    title: 'Friday Night Old-Time Jam',
    description: 'Weekly jam session for all skill levels.',
    startDateTime: new Date('2030-06-15T19:00:00Z'),
    endDateTime: new Date('2030-06-15T21:00:00Z'),
    recurrenceRule: 'FREQ=WEEKLY;BYDAY=FR',
    location: '688 Beulah Road, Morgantown, WV 26508',
    type: 'jam',
    public: true,
    sourceRef: null,
    createdBy: 'admin-uid-123',
  };

  describe('valid data', () => {
    it('passes with all fields', () => {
      const result = calendarEventValidation(validEvent);
      expect(result.isValid()).toBe(true);
    });

    it('passes with minimal required fields', () => {
      const result = calendarEventValidation({
        title: 'Store Hours',
        startDateTime: new Date('2030-06-15T12:00:00Z'),
        endDateTime: new Date('2030-06-15T18:00:00Z'),
        type: 'hours',
      });
      expect(result.isValid()).toBe(true);
    });

    it('passes with null recurrenceRule (one-time event)', () => {
      const result = calendarEventValidation({
        ...validEvent,
        recurrenceRule: null,
      });
      expect(result.isValid()).toBe(true);
    });
  });

  describe('title field', () => {
    it('fails when title is missing', () => {
      const result = calendarEventValidation({
        ...validEvent,
        title: '',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('title')).toContain('Title is required');
    });

    it('fails when title is too short', () => {
      const result = calendarEventValidation({
        ...validEvent,
        title: 'AB',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('title')).toContain(
        'Title must be at least 3 characters'
      );
    });

    it('fails when title is too long', () => {
      const result = calendarEventValidation({
        ...validEvent,
        title: 'a'.repeat(200),
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('title')).toContain(
        'Title must be less than 200 characters'
      );
    });
  });

  describe('description field', () => {
    it('passes when description is undefined (optional)', () => {
      const result = calendarEventValidation({
        ...validEvent,
        description: undefined as unknown as string,
      });
      expect(result.hasErrors('description')).toBe(false);
    });

    it('fails when description exceeds 2000 characters', () => {
      const result = calendarEventValidation({
        ...validEvent,
        description: 'a'.repeat(2001),
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('description')).toContain(
        'Description must be less than 2000 characters'
      );
    });
  });

  describe('startDateTime field', () => {
    it('fails when startDateTime is missing', () => {
      const result = calendarEventValidation({
        ...validEvent,
        startDateTime: undefined as unknown as Date,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('startDateTime')).toContain(
        'Start date and time is required'
      );
    });
  });

  describe('endDateTime field', () => {
    it('fails when endDateTime is missing', () => {
      const result = calendarEventValidation({
        ...validEvent,
        endDateTime: undefined as unknown as Date,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('endDateTime')).toContain(
        'End date and time is required'
      );
    });

    it('fails when endDateTime is before startDateTime', () => {
      const result = calendarEventValidation({
        ...validEvent,
        startDateTime: new Date('2030-06-15T21:00:00Z'),
        endDateTime: new Date('2030-06-15T19:00:00Z'),
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('endDateTime')).toContain(
        'End time must be after start time'
      );
    });

    it('fails when endDateTime equals startDateTime', () => {
      const sameDate = new Date('2030-06-15T19:00:00Z');
      const result = calendarEventValidation({
        ...validEvent,
        startDateTime: sameDate,
        endDateTime: sameDate,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('endDateTime')).toContain(
        'End time must be after start time'
      );
    });
  });

  describe('type field', () => {
    it('fails when type is missing', () => {
      const result = calendarEventValidation({
        ...validEvent,
        type: '' as 'event',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('type')).toContain('Event type is required');
    });

    it('fails when type is invalid', () => {
      const result = calendarEventValidation({
        ...validEvent,
        type: 'concert' as 'event',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('type')).toContain('Event type must be valid');
    });

    it('passes with all valid types', () => {
      const types = ['class', 'lesson', 'event', 'jam', 'hours'] as const;
      types.forEach((type) => {
        const result = calendarEventValidation({
          ...validEvent,
          type,
        });
        expect(result.hasErrors('type')).toBe(false);
      });
    });
  });

  describe('recurrenceRule field', () => {
    it('passes when recurrenceRule is null', () => {
      const result = calendarEventValidation({
        ...validEvent,
        recurrenceRule: null,
      });
      expect(result.hasErrors('recurrenceRule')).toBe(false);
    });

    it('passes when recurrenceRule is undefined', () => {
      const result = calendarEventValidation({
        ...validEvent,
        recurrenceRule: undefined as unknown as string | null,
      });
      expect(result.hasErrors('recurrenceRule')).toBe(false);
    });

    it('fails when recurrenceRule is empty string', () => {
      const result = calendarEventValidation({
        ...validEvent,
        recurrenceRule: '',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('recurrenceRule')).toContain(
        'Recurrence rule must not be empty if provided'
      );
    });

    it('passes with valid RRULE strings', () => {
      const rules = [
        'FREQ=WEEKLY;BYDAY=FR',
        'FREQ=WEEKLY;BYDAY=WE,FR,SA',
        'FREQ=MONTHLY;BYMONTHDAY=1',
        'FREQ=BIWEEKLY',
      ];
      rules.forEach((rule) => {
        const result = calendarEventValidation({
          ...validEvent,
          recurrenceRule: rule,
        });
        expect(result.hasErrors('recurrenceRule')).toBe(false);
      });
    });
  });

  describe('location field', () => {
    it('passes when location is undefined (optional)', () => {
      const result = calendarEventValidation({
        ...validEvent,
        location: undefined as unknown as string,
      });
      expect(result.hasErrors('location')).toBe(false);
    });

    it('fails when location exceeds 500 characters', () => {
      const result = calendarEventValidation({
        ...validEvent,
        location: 'a'.repeat(501),
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('location')).toContain(
        'Location must be less than 500 characters'
      );
    });
  });

  describe('single-field validation', () => {
    it('only validates specified field', () => {
      const invalidData = {
        title: '',
        startDateTime: undefined as unknown as Date,
        endDateTime: undefined as unknown as Date,
        type: '' as 'event',
      };

      const result = calendarEventValidation(invalidData, 'title');
      expect(result.hasErrors('title')).toBe(true);
      expect(result.hasErrors('startDateTime')).toBe(false);
      expect(result.hasErrors('type')).toBe(false);
    });
  });
});
