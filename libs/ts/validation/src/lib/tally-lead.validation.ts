/**
 * Tally lead webhook validation suite
 *
 * Vest validation for the payload extracted from a Tally newsletter-signup
 * submission. Email is the only hard requirement — every other field is
 * optional context for downstream attribution.
 */
import { staticSuite, test, enforce, only } from 'vest';

export interface TallyLeadValidationInput {
  email?: string;
  gaClientId?: string;
  fbp?: string;
  fbc?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referrer?: string;
  landingPage?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const tallyLeadValidation = staticSuite(
  (data: TallyLeadValidationInput, field?: string | string[]) => {
    only(field);

    test('email', 'Email is required', () => {
      enforce(data.email).isNotBlank();
    });

    test('email', 'Email must be valid', () => {
      if (data.email) {
        enforce(EMAIL_PATTERN.test(data.email)).isTruthy();
      }
    });
  }
);
