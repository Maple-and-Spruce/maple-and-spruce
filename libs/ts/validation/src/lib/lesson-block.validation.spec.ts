import { describe, it, expect } from 'vitest';
import { lessonBlockValidation } from './lesson-block.validation';
import type { CreateLessonBlockInput } from '@maple/ts/domain';

const valid: CreateLessonBlockInput = {
  teacherId: 'instr-nathan',
  dayOfWeek: 2,
  startMinutes: 15 * 60,
  endMinutes: 18 * 60,
  label: 'Tuesday afternoons',
};

describe('lessonBlockValidation', () => {
  it('passes for a well-formed block', () => {
    expect(lessonBlockValidation(valid).isValid()).toBe(true);
  });

  it('requires a teacher', () => {
    const r = lessonBlockValidation({ ...valid, teacherId: '' });
    expect(r.isValid()).toBe(false);
    expect(r.getErrors('teacherId')).toContain('Teacher is required');
  });

  it.each([-1, 7])('rejects out-of-range dayOfWeek %i', (dow) => {
    expect(lessonBlockValidation({ ...valid, dayOfWeek: dow }).isValid()).toBe(false);
  });

  it('accepts dayOfWeek 0 (Sunday)', () => {
    expect(lessonBlockValidation({ ...valid, dayOfWeek: 0 }).isValid()).toBe(true);
  });

  it('rejects end before or equal to start', () => {
    expect(
      lessonBlockValidation({ ...valid, startMinutes: 1080, endMinutes: 900 }).isValid()
    ).toBe(false);
    expect(
      lessonBlockValidation({ ...valid, startMinutes: 900, endMinutes: 900 }).isValid()
    ).toBe(false);
  });

  it('rejects times outside the day', () => {
    expect(lessonBlockValidation({ ...valid, startMinutes: -1 }).isValid()).toBe(false);
    expect(lessonBlockValidation({ ...valid, endMinutes: 1441 }).isValid()).toBe(false);
  });

  it('requires the time fields', () => {
    expect(
      lessonBlockValidation({ ...valid, startMinutes: undefined as unknown as number }).isValid()
    ).toBe(false);
    expect(
      lessonBlockValidation({ ...valid, endMinutes: undefined as unknown as number }).isValid()
    ).toBe(false);
  });
});
