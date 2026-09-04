import { describe, it, expect } from 'vitest';
import {
  lessonValidation,
  lessonSeriesValidation,
} from './lesson.validation';
import type {
  CreateLessonInput,
  CreateLessonSeriesInput,
} from '@maple/ts/domain';

describe('lessonValidation', () => {
  const validLesson: CreateLessonInput = {
    studentId: 'student-1',
    teacherId: 'instructor-1',
    scheduledAt: new Date('2026-05-01T15:00:00Z'),
    durationMinutes: 30,
    status: 'scheduled',
  };

  describe('valid data', () => {
    it('passes with all required fields', () => {
      const result = lessonValidation(validLesson);
      expect(result.isValid()).toBe(true);
    });

    it('passes with notes and other optional fields', () => {
      const result = lessonValidation({
        ...validLesson,
        notes: 'Focus on bowing.',
      });
      expect(result.isValid()).toBe(true);
    });
  });

  describe('studentId / teacherId', () => {
    it('fails when studentId is missing', () => {
      const result = lessonValidation({ ...validLesson, studentId: '' });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('studentId')).toContain('Student is required');
    });

    it('fails when teacherId is missing', () => {
      const result = lessonValidation({ ...validLesson, teacherId: '' });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('teacherId')).toContain('Teacher is required');
    });
  });

  describe('scheduledAt', () => {
    it('fails when missing', () => {
      const result = lessonValidation({
        ...validLesson,
        scheduledAt: undefined as unknown as Date,
      });
      expect(result.isValid()).toBe(false);
    });

    it('fails when the date is invalid', () => {
      const result = lessonValidation({
        ...validLesson,
        scheduledAt: new Date('not-a-date'),
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('scheduledAt')).toContain(
        'Scheduled date/time must be a valid date'
      );
    });
  });

  describe('durationMinutes', () => {
    it('fails when missing', () => {
      const result = lessonValidation({
        ...validLesson,
        durationMinutes: undefined as unknown as number,
      });
      expect(result.isValid()).toBe(false);
    });

    it.each([30, 45, 60])(
      'accepts %i minutes',
      (durationMinutes) => {
        const result = lessonValidation({ ...validLesson, durationMinutes });
        expect(result.hasErrors('durationMinutes')).toBe(false);
      }
    );

    it('rejects a non-standard duration', () => {
      const result = lessonValidation({
        ...validLesson,
        durationMinutes: 25,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('durationMinutes')).toContain(
        'Duration must be 30, 45, or 60 minutes'
      );
    });
  });

  describe('status', () => {
    it('fails when missing', () => {
      const result = lessonValidation({
        ...validLesson,
        status: '' as 'scheduled',
      });
      expect(result.isValid()).toBe(false);
    });

    it('rejects an unknown status', () => {
      const result = lessonValidation({
        ...validLesson,
        status: 'pending' as 'scheduled',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('status')).toContain(
        'Status must be scheduled, rendered, no-show, or cancelled'
      );
    });

    it.each(['scheduled', 'rendered', 'cancelled'] as const)(
      'accepts %s',
      (status) => {
        const result = lessonValidation({ ...validLesson, status });
        expect(result.hasErrors('status')).toBe(false);
      }
    );

    it('accepts the no-show status (#796)', () => {
      // Private pay is charged for a no-show, Hope never is — but either way
      // the teacher has to be able to record what actually happened.
      const result = lessonValidation(
        { ...validLesson, status: 'no-show' },
        'status'
      );
      expect(result.hasErrors('status')).toBe(false);
    });
  });

  describe('notes', () => {
    it('fails when over 2000 characters', () => {
      const result = lessonValidation({
        ...validLesson,
        notes: 'a'.repeat(2001),
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('notes')).toContain(
        'Notes must be less than 2000 characters'
      );
    });
  });
});

describe('lessonSeriesValidation', () => {
  const validSeries: CreateLessonSeriesInput = {
    studentId: 'student-1',
    teacherId: 'instructor-1',
    durationMinutes: 30,
    scheduledAts: [
      new Date('2026-05-01T15:00:00Z'),
      new Date('2026-05-08T15:00:00Z'),
      new Date('2026-05-15T15:00:00Z'),
    ],
  };

  it('passes with a non-empty date list', () => {
    const result = lessonSeriesValidation(validSeries);
    expect(result.isValid()).toBe(true);
  });

  it('fails when scheduledAts is empty', () => {
    const result = lessonSeriesValidation({
      ...validSeries,
      scheduledAts: [],
    });
    expect(result.isValid()).toBe(false);
    expect(result.getErrors('scheduledAts')).toContain(
      'At least one scheduled date is required'
    );
  });

  it('fails when scheduledAts contains an invalid date', () => {
    const result = lessonSeriesValidation({
      ...validSeries,
      scheduledAts: [
        new Date('2026-05-01T15:00:00Z'),
        new Date('bogus'),
      ],
    });
    expect(result.isValid()).toBe(false);
    expect(result.getErrors('scheduledAts')).toContain(
      'All scheduled dates must be valid Date values'
    );
  });

  it('fails when studentId is missing', () => {
    const result = lessonSeriesValidation({ ...validSeries, studentId: '' });
    expect(result.isValid()).toBe(false);
  });

  it('fails when teacherId is missing', () => {
    const result = lessonSeriesValidation({ ...validSeries, teacherId: '' });
    expect(result.isValid()).toBe(false);
  });

  it('rejects a non-standard duration', () => {
    const result = lessonSeriesValidation({
      ...validSeries,
      durationMinutes: 20,
    });
    expect(result.isValid()).toBe(false);
  });
});