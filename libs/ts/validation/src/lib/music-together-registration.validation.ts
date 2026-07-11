/**
 * Music Together registration validation suite
 *
 * Vest validation for the family enrollment form. Used on both the public
 * Webflow checkout and the server (the rule in firebase-functions.md requires
 * mutating functions to validate with the shared suite before any external
 * write — invalid data must never reach the MT Square account).
 *
 * @see https://vestjs.dev/
 */
import { staticSuite, test, enforce, only } from 'vest';
import { MT_MAX_CHILDREN } from '@maple/ts/domain';

/** One child row from the form. `dob` may arrive as a Date or ISO string. */
export interface MusicTogetherChildInput {
  name?: string;
  dob?: Date | string;
}

/**
 * Input shape for Music Together registration validation.
 */
export interface MusicTogetherRegistrationValidationInput {
  sectionId?: string;
  /** Enrolling adult's first name. */
  adultFirstName?: string;
  /** Enrolling adult's last name. */
  adultLastName?: string;
  parentNames?: string[];
  children?: MusicTogetherChildInput[];
  email?: string;
  phone?: string;
  address?: string;
  /** Optional accommodation notes (special needs / allergies). */
  accommodations?: string;
  paymentPlan?: 'full' | 'installments';
  /** Policies-accepted checkbox. */
  policiesAccepted?: boolean;
  /** Privacy-notice consent checkbox. */
  privacyConsent?: boolean;
  /** Card-on-file authorization checkbox (required for installments). */
  cardOnFileAuth?: boolean;
}

/** Parse a Date|string DOB to a Date, or undefined if unparseable. */
function parseDob(dob: Date | string | undefined): Date | undefined {
  if (dob === undefined) return undefined;
  const d = dob instanceof Date ? dob : new Date(dob);
  return isNaN(d.getTime()) ? undefined : d;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d\s()-]{7,20}$/;

/**
 * Validate Music Together registration form data.
 *
 * @param data - Partial registration data to validate
 * @param field - Optional field(s) to validate (for partial/single-field runs)
 */
export const musicTogetherRegistrationValidation = staticSuite(
  (
    data: MusicTogetherRegistrationValidationInput,
    field?: string | string[]
  ) => {
    only(field);

    test('sectionId', 'Section is required', () => {
      enforce(data.sectionId).isNotBlank();
    });

    test('adultFirstName', "Adult's first name is required", () => {
      enforce(data.adultFirstName).isNotBlank();
    });

    test('adultFirstName', 'First name must be less than 100 characters', () => {
      if (data.adultFirstName) enforce(data.adultFirstName).shorterThan(100);
    });

    test('adultLastName', "Adult's last name is required", () => {
      enforce(data.adultLastName).isNotBlank();
    });

    test('adultLastName', 'Last name must be less than 100 characters', () => {
      if (data.adultLastName) enforce(data.adultLastName).shorterThan(100);
    });

    // At least one non-blank parent/guardian name.
    test('parentNames', 'At least one parent or guardian name is required', () => {
      enforce(
        (data.parentNames ?? []).filter((n) => n && n.trim().length > 0)
      ).longerThanOrEquals(1);
    });

    test('parentNames', 'Each name must be less than 100 characters', () => {
      for (const name of data.parentNames ?? []) {
        if (name) enforce(name).shorterThan(100);
      }
    });

    // At least one child, at most MT_MAX_CHILDREN, each with a name and a
    // valid past date of birth.
    test('children', 'At least one child is required', () => {
      enforce(data.children ?? []).longerThanOrEquals(1);
    });

    test(
      'children',
      `No more than ${MT_MAX_CHILDREN} children can be enrolled per family`,
      () => {
        enforce(data.children ?? []).shorterThanOrEquals(MT_MAX_CHILDREN);
      }
    );

    test('children', 'Each child needs a name', () => {
      for (const child of data.children ?? []) {
        enforce(child.name).isNotBlank();
      }
    });

    test('children', 'Each child needs a valid date of birth', () => {
      for (const child of data.children ?? []) {
        const dob = parseDob(child.dob);
        enforce(dob).isNotNullish();
      }
    });

    test('children', "A child's date of birth cannot be in the future", () => {
      const now = Date.now();
      for (const child of data.children ?? []) {
        const dob = parseDob(child.dob);
        if (dob) enforce(dob.getTime()).lessThanOrEquals(now);
      }
    });

    test('email', 'Email is required', () => {
      enforce(data.email).isNotBlank();
    });

    test('email', 'Email must be a valid email address', () => {
      if (data.email) enforce(data.email).matches(EMAIL_RE);
    });

    test('phone', 'Phone number is required', () => {
      enforce(data.phone).isNotBlank();
    });

    test('phone', 'Phone number must be valid', () => {
      if (data.phone) enforce(data.phone).matches(PHONE_RE);
    });

    test('address', 'Address is required', () => {
      enforce(data.address).isNotBlank();
    });

    test('address', 'Address must be less than 300 characters', () => {
      if (data.address) enforce(data.address).shorterThanOrEquals(300);
    });

    test('accommodations', 'Accommodations must be less than 1000 characters', () => {
      if (data.accommodations)
        enforce(data.accommodations).shorterThanOrEquals(1000);
    });

    test('paymentPlan', 'Choose a payment option', () => {
      enforce(data.paymentPlan).inside(['full', 'installments']);
    });

    test('policiesAccepted', 'You must accept the program policies', () => {
      enforce(data.policiesAccepted).equals(true);
    });

    test('privacyConsent', 'You must accept the privacy notice', () => {
      enforce(data.privacyConsent).equals(true);
    });

    // Card-on-file authorization is required only for the installment plan,
    // where a second charge runs later with no parent present.
    test(
      'cardOnFileAuth',
      'You must authorize the second installment charge',
      () => {
        if (data.paymentPlan === 'installments') {
          enforce(data.cardOnFileAuth).equals(true);
        }
      }
    );
  }
);
