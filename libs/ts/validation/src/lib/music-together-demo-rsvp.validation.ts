/**
 * Music Together demo-class RSVP validation suite
 *
 * Used on the public demo RSVP form (the Webflow widget) and on the
 * addMusicTogetherDemoRsvp cloud function. Demos are free — the only inputs are
 * the chosen slot label, the family's name, and their email.
 *
 * @see https://vestjs.dev/
 */
import { staticSuite, test, enforce, only } from 'vest';

export interface MusicTogetherDemoRsvpValidationInput {
  demoSlot?: string;
  name?: string;
  email?: string;
}

export const musicTogetherDemoRsvpValidation = staticSuite(
  (data: MusicTogetherDemoRsvpValidationInput, field?: string | string[]) => {
    only(field);

    test('demoSlot', 'Please choose a demo class time', () => {
      enforce(data.demoSlot).isNotBlank();
    });
    test('demoSlot', 'Demo slot must be less than 200 characters', () => {
      if (data.demoSlot) enforce(data.demoSlot).shorterThan(200);
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
