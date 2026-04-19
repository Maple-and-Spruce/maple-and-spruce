/**
 * Student validation suite
 *
 * Vest validation for music lesson student forms.
 * @see https://vestjs.dev/
 */
import { staticSuite, test, enforce, only } from 'vest';
import type { CreateStudentInput } from '@maple/ts/domain';
import { INSTRUMENTS, LESSON_LENGTHS } from '@maple/ts/domain';

export const studentValidation = staticSuite(
  (data: Partial<CreateStudentInput>, field?: string | string[]) => {
    only(field);

    test('name', 'Student name is required', () => {
      enforce(data.name).isNotBlank();
    });

    test('name', 'Student name must be at least 2 characters', () => {
      enforce(data.name).longerThanOrEquals(2);
    });

    test('instrument', 'Instrument is required', () => {
      enforce(data.instrument).isNotBlank();
    });

    test('instrument', 'Instrument must be a valid option', () => {
      if (data.instrument) {
        enforce(data.instrument).inside(INSTRUMENTS);
      }
    });

    test('primaryTeacherId', 'Primary teacher is required', () => {
      enforce(data.primaryTeacherId).isNotBlank();
    });

    test(
      'registeredLessonLength',
      'Registered lesson length must be valid if provided',
      () => {
        if (data.registeredLessonLength) {
          enforce(data.registeredLessonLength).inside(LESSON_LENGTHS);
        }
      }
    );

    test('primaryContactName', 'Primary contact name is required', () => {
      enforce(data.primaryContactName).isNotBlank();
    });

    test('primaryContactEmail', 'Primary contact email is required', () => {
      enforce(data.primaryContactEmail).isNotBlank();
    });

    test('primaryContactEmail', 'Primary contact email must be valid', () => {
      enforce(data.primaryContactEmail).matches(
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      );
    });

    test(
      'primaryContactPhone',
      'Primary contact phone must be valid if provided',
      () => {
        if (data.primaryContactPhone) {
          enforce(data.primaryContactPhone).matches(/^[\d\s\-+()]+$/);
        }
      }
    );

    test(
      'secondaryContactEmail',
      'Secondary contact email must be valid if provided',
      () => {
        if (data.secondaryContactEmail) {
          enforce(data.secondaryContactEmail).matches(
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/
          );
        }
      }
    );

    test(
      'secondaryContactPhone',
      'Secondary contact phone must be valid if provided',
      () => {
        if (data.secondaryContactPhone) {
          enforce(data.secondaryContactPhone).matches(/^[\d\s\-+()]+$/);
        }
      }
    );

    test('status', 'Status is required', () => {
      enforce(data.status).isNotBlank();
    });

    test('status', 'Status must be active or inactive', () => {
      if (data.status) {
        enforce(data.status).inside(['active', 'inactive']);
      }
    });

    test('notes', 'Notes must be less than 2000 characters', () => {
      if (data.notes) {
        enforce(data.notes).shorterThanOrEquals(2000);
      }
    });
  }
);
