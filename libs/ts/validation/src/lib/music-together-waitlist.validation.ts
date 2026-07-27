/**
 * Music Together waitlist validation suite
 *
 * Used on the public waitlist form (shown when a section is full) and on the
 * addToMusicTogetherWaitlist cloud function.
 *
 * @see https://vestjs.dev/
 */
import { staticSuite, test, enforce, only } from 'vest';

export interface MusicTogetherWaitlistValidationInput {
  sectionId?: string;
  name?: string;
  email?: string;
  availability?: string;
}

export const musicTogetherWaitlistValidation = staticSuite(
  (data: MusicTogetherWaitlistValidationInput, field?: string | string[]) => {
    only(field);

    test('sectionId', 'Section is required', () => {
      enforce(data.sectionId).isNotBlank();
    });

    // Name is optional (the email-only "coming soon" capture omits it), but
    // cap its length when present.
    test('name', 'Name must be less than 100 characters', () => {
      if (data.name) enforce(data.name).shorterThan(100);
    });

    test('email', 'Email is required', () => {
      enforce(data.email).isNotBlank();
    });
    test('email', 'Email must be a valid email address', () => {
      if (data.email) {
        enforce(data.email).matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      }
    });

    // Availability is optional, but cap its length.
    test('availability', 'Availability must be less than 500 characters', () => {
      if (data.availability) {
        enforce(data.availability).shorterThanOrEquals(500);
      }
    });
  }
);
