/**
 * Music Together demo-class RSVP validation suite
 *
 * Used on the public demo RSVP form (the Webflow widget) and on the
 * addMusicTogetherDemoRsvp cloud function. A family picks a specific demo
 * (`demoId`) and gives us their name + email — demos are free, so there's no
 * payment.
 *
 * @see https://vestjs.dev/
 */
import { staticSuite, test, enforce, only } from 'vest';

export interface MusicTogetherDemoRsvpValidationInput {
  demoId?: string;
  name?: string;
  email?: string;
}

export const musicTogetherDemoRsvpValidation = staticSuite(
  (data: MusicTogetherDemoRsvpValidationInput, field?: string | string[]) => {
    only(field);

    test('demoId', 'Please choose a demo class', () => {
      enforce(data.demoId).isNotBlank();
    });

    test('name', 'Name is required', () => {
      enforce(data.name).isNotBlank();
    });
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
  }
);
