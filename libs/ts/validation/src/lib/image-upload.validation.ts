/**
 * Image upload validation suite
 *
 * Shared Vest suite for the `upload-*-image` cloud functions. Validates the
 * base64 payload, the MIME type, and the decoded image size. Allowed MIME
 * types and the max size are configurable per caller because downstream
 * providers differ (e.g. Square's Catalog API rejects webp and caps at 15MB,
 * Firebase Storage has neither constraint).
 *
 * Entity-id handling is left to callers because it differs per endpoint —
 * product uploads require it (Square needs the item id), artist/class/
 * instructor uploads accept a missing id and fall back to a `temp/` path.
 */
import { staticSuite, test, enforce, only } from 'vest';

/** Default allowed MIME types (matches Firebase Storage uploads). */
export const DEFAULT_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

/** Default max decoded image size: 10MB. */
export const DEFAULT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export interface ImageUploadValidationInput {
  /** Base64-encoded image payload. */
  imageBase64?: string;
  /** MIME type declared by the caller. */
  contentType?: string;
  /** Allowed MIME types for this upload. Defaults to DEFAULT_IMAGE_MIME_TYPES. */
  allowedMimeTypes?: readonly string[];
  /** Max decoded size in bytes. Defaults to DEFAULT_IMAGE_MAX_BYTES. */
  maxSizeBytes?: number;
}

/** Estimate decoded byte length from a base64 string (~33% overhead). */
function estimateDecodedBytes(base64: string): number {
  return Math.ceil(base64.length * 0.75);
}

export const imageUploadValidation = staticSuite(
  (data: ImageUploadValidationInput, field?: string | string[]) => {
    only(field);

    const allowed = data.allowedMimeTypes ?? DEFAULT_IMAGE_MIME_TYPES;
    const maxBytes = data.maxSizeBytes ?? DEFAULT_IMAGE_MAX_BYTES;
    const maxMB = Math.round(maxBytes / 1024 / 1024);

    test('imageBase64', 'Image data is required', () => {
      enforce(data.imageBase64).isNotBlank();
    });

    test('contentType', 'Content type is required', () => {
      enforce(data.contentType).isNotBlank();
    });

    test(
      'contentType',
      `Content type must be one of: ${allowed.join(', ')}`,
      () => {
        if (data.contentType) {
          enforce(data.contentType).inside(allowed);
        }
      }
    );

    test('imageBase64', `Image must be smaller than ${maxMB}MB`, () => {
      if (data.imageBase64) {
        enforce(estimateDecodedBytes(data.imageBase64)).lessThanOrEquals(
          maxBytes
        );
      }
    });
  }
);
