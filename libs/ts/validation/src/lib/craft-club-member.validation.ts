/**
 * Craft Club member validation suite
 *
 * Vest validation for Craft Club intake (admin approval, signup request, and
 * subscribe). Used on both the client forms and the server.
 *
 * Declared with `staticSuite` so it's a pure function — safe to call from warm
 * Cloud Function containers without `.reset()`.
 *
 * @see https://vestjs.dev/
 */
import { staticSuite, test, enforce, only } from 'vest';

/** Input shape for Craft Club member validation. */
export interface CraftClubMemberValidationInput {
  email?: string;
  name?: string;
  phone?: string;
  notes?: string;
}

/**
 * Validate Craft Club member form data.
 *
 * @param data - Partial member data to validate
 * @param field - Optional field(s) to validate (for single-field validation)
 */
export const craftClubMemberValidation = staticSuite(
  (data: CraftClubMemberValidationInput, field?: string | string[]) => {
    only(field);

    // Email is the natural key — always required and must be well-formed.
    test('email', 'Email is required', () => {
      enforce(data.email).isNotBlank();
    });

    test('email', 'Email must be a valid email address', () => {
      if (data.email) {
        enforce(data.email).matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      }
    });

    // Name is optional (admins can pre-approve by email alone), validated only
    // when provided.
    test('name', 'Name must be at least 2 characters', () => {
      if (data.name) {
        enforce(data.name).longerThanOrEquals(2);
      }
    });

    test('name', 'Name must be less than 100 characters', () => {
      if (data.name) {
        enforce(data.name).shorterThan(100);
      }
    });

    // Phone is optional.
    test('phone', 'Phone number must be valid', () => {
      if (data.phone) {
        enforce(data.phone).matches(/^[+]?[\d\s()-]{7,20}$/);
      }
    });

    // Notes are optional.
    test('notes', 'Notes must be less than 500 characters', () => {
      if (data.notes) {
        enforce(data.notes).shorterThanOrEquals(500);
      }
    });
  }
);
