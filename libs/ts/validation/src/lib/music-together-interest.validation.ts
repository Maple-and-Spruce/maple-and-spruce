/**
 * Music Together cross-section interest validation suite
 *
 * Used on the public interest form (multi-section demand list) and on the
 * addMusicTogetherInterest cloud function. Unlike the per-section waitlist,
 * this carries a list of section ids plus three preference free-text fields.
 *
 * @see https://vestjs.dev/
 */
import { staticSuite, test, enforce, only } from 'vest';

export interface MusicTogetherInterestValidationInput {
  name?: string;
  email?: string;
  interestedSectionIds?: string[];
  preferenceNote?: string;
  alternateTimesNote?: string;
  notes?: string;
}

const NOTE_MAX = 1000;

export const musicTogetherInterestValidation = staticSuite(
  (data: MusicTogetherInterestValidationInput, field?: string | string[]) => {
    only(field);

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

    // At least one signal of interest: either a checked section or a note about
    // what times would work. An entirely blank interest submission is useless
    // for demand-gauging.
    test(
      'interestedSectionIds',
      'Select at least one section, or tell us what times would work',
      () => {
        const hasSections =
          Array.isArray(data.interestedSectionIds) &&
          data.interestedSectionIds.length > 0;
        const hasAltTimes = !!data.alternateTimesNote?.trim();
        enforce(hasSections || hasAltTimes).isTruthy();
      }
    );

    test(
      'interestedSectionIds',
      'Section selection is invalid',
      () => {
        if (data.interestedSectionIds !== undefined) {
          enforce(data.interestedSectionIds).isArray();
          for (const id of data.interestedSectionIds) {
            enforce(id).isNotBlank();
          }
        }
      }
    );

    test('preferenceNote', `Please keep under ${NOTE_MAX} characters`, () => {
      if (data.preferenceNote) {
        enforce(data.preferenceNote).shorterThanOrEquals(NOTE_MAX);
      }
    });
    test('alternateTimesNote', `Please keep under ${NOTE_MAX} characters`, () => {
      if (data.alternateTimesNote) {
        enforce(data.alternateTimesNote).shorterThanOrEquals(NOTE_MAX);
      }
    });
    test('notes', `Please keep under ${NOTE_MAX} characters`, () => {
      if (data.notes) {
        enforce(data.notes).shorterThanOrEquals(NOTE_MAX);
      }
    });
  }
);
