/**
 * Class waitlist validation suite
 *
 * Tiny suite — just an email + classId. Used on the public waitlist
 * signup form and the addToClassWaitlist cloud function.
 *
 * @see https://vestjs.dev/
 */
import { staticSuite, test, enforce, only } from 'vest';

export interface ClassWaitlistValidationInput {
  classId?: string;
  email?: string;
}

export const classWaitlistValidation = staticSuite(
  (data: ClassWaitlistValidationInput, field?: string | string[]) => {
    only(field);

    test('classId', 'Class is required', () => {
      enforce(data.classId).isNotBlank();
    });

    test('email', 'Email is required', () => {
      enforce(data.email).isNotBlank();
    });

    test('email', 'Email must be a valid email address', () => {
      if (data.email) {
        enforce(data.email).matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      }
    });
  }
);
