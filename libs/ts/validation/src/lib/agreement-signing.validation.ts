/**
 * Agreement Signing validation suite
 *
 * Vest validation for the public signing form submission.
 * Validates signature data, printed name, and optional minor fields.
 *
 * @see https://vestjs.dev/
 */
import { staticSuite, test, enforce, only, skipWhen } from 'vest';

export interface AgreementSigningValidationInput {
  token?: string;
  signatureData?: string;
  printedName?: string;
  mediaReleaseChoice?: string;
  isMinor?: boolean;
  minorName?: string;
  guardianName?: string;
  guardianSignatureData?: string;
}

export const agreementSigningValidation = staticSuite(
  (data: AgreementSigningValidationInput, field?: string | string[]) => {
    only(field);

    test('token', 'Signing token is required', () => {
      enforce(data.token).isNotBlank();
    });

    test('signatureData', 'Signature is required', () => {
      enforce(data.signatureData).isNotBlank();
    });

    test('printedName', 'Printed name is required', () => {
      enforce(data.printedName).isNotBlank();
    });

    test('printedName', 'Printed name must be at least 2 characters', () => {
      if (data.printedName) {
        enforce(data.printedName).longerThanOrEquals(2);
      }
    });

    test('printedName', 'Printed name must be less than 100 characters', () => {
      if (data.printedName) {
        enforce(data.printedName).shorterThan(100);
      }
    });

    test(
      'mediaReleaseChoice',
      'Media release choice must be grant, grant-without-name, or deny',
      () => {
        if (data.mediaReleaseChoice) {
          enforce(data.mediaReleaseChoice).inside([
            'grant',
            'grant-without-name',
            'deny',
          ]);
        }
      }
    );

    // Minor fields are required when isMinor is true
    skipWhen(!data.isMinor, () => {
      test('minorName', 'Minor name is required', () => {
        enforce(data.minorName).isNotBlank();
      });

      test('guardianName', 'Parent/guardian name is required', () => {
        enforce(data.guardianName).isNotBlank();
      });

      test('guardianSignatureData', 'Parent/guardian signature is required', () => {
        enforce(data.guardianSignatureData).isNotBlank();
      });
    });
  }
);
