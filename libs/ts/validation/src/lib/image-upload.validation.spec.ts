import { describe, it, expect } from 'vitest';
import {
  imageUploadValidation,
  DEFAULT_IMAGE_MAX_BYTES,
  type ImageUploadValidationInput,
} from './image-upload.validation';

/** Build a base64 payload whose decoded size is roughly `bytes`. */
function base64OfSize(bytes: number): string {
  // 4 base64 chars encode 3 bytes, so base64 length = ceil(bytes / 3) * 4.
  const len = Math.ceil(bytes / 3) * 4;
  return 'A'.repeat(len);
}

describe('imageUploadValidation', () => {
  const validInput: ImageUploadValidationInput = {
    imageBase64: base64OfSize(1024),
    contentType: 'image/jpeg',
  };

  describe('valid data', () => {
    it('passes with jpeg under the default size limit', () => {
      const result = imageUploadValidation(validInput);
      expect(result.hasErrors()).toBe(false);
    });

    it('passes for each default mime type', () => {
      for (const contentType of [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
      ]) {
        const result = imageUploadValidation({ ...validInput, contentType });
        expect(result.hasErrors('contentType')).toBe(false);
      }
    });
  });

  describe('imageBase64', () => {
    it('fails when payload is missing', () => {
      const result = imageUploadValidation({
        ...validInput,
        imageBase64: undefined,
      });
      expect(result.getErrors('imageBase64')).toContain('Image data is required');
    });

    it('fails when decoded size exceeds the default limit', () => {
      const oversized = base64OfSize(DEFAULT_IMAGE_MAX_BYTES + 1024);
      const result = imageUploadValidation({
        ...validInput,
        imageBase64: oversized,
      });
      expect(result.hasErrors('imageBase64')).toBe(true);
      expect(result.getErrors('imageBase64').join(' ')).toMatch(/smaller than/i);
    });

    it('respects a custom maxSizeBytes override (Square 15MB case)', () => {
      const twelveMB = base64OfSize(12 * 1024 * 1024);
      // Default 10MB limit rejects:
      expect(
        imageUploadValidation({ ...validInput, imageBase64: twelveMB })
          .hasErrors('imageBase64')
      ).toBe(true);
      // 15MB override accepts:
      expect(
        imageUploadValidation({
          ...validInput,
          imageBase64: twelveMB,
          maxSizeBytes: 15 * 1024 * 1024,
        }).hasErrors('imageBase64')
      ).toBe(false);
    });
  });

  describe('contentType', () => {
    it('fails when contentType is missing', () => {
      const result = imageUploadValidation({
        ...validInput,
        contentType: undefined,
      });
      expect(result.getErrors('contentType')).toContain(
        'Content type is required'
      );
    });

    it('rejects disallowed mime types under the default allowlist', () => {
      const result = imageUploadValidation({
        ...validInput,
        contentType: 'application/pdf',
      });
      expect(result.hasErrors('contentType')).toBe(true);
    });

    it('rejects webp under a Square-style allowlist override', () => {
      const result = imageUploadValidation({
        ...validInput,
        contentType: 'image/webp',
        allowedMimeTypes: [
          'image/jpeg',
          'image/pjpeg',
          'image/png',
          'image/gif',
        ],
      });
      expect(result.hasErrors('contentType')).toBe(true);
    });

    it('accepts pjpeg only when the override allows it', () => {
      expect(
        imageUploadValidation({ ...validInput, contentType: 'image/pjpeg' })
          .hasErrors('contentType')
      ).toBe(true);
      expect(
        imageUploadValidation({
          ...validInput,
          contentType: 'image/pjpeg',
          allowedMimeTypes: [
            'image/jpeg',
            'image/pjpeg',
            'image/png',
            'image/gif',
          ],
        }).hasErrors('contentType')
      ).toBe(false);
    });
  });

  describe('staticSuite contract', () => {
    it('returns a fresh result per call — no state leakage', () => {
      // First call with invalid data sets errors
      const bad = imageUploadValidation({ imageBase64: '', contentType: '' });
      expect(bad.hasErrors()).toBe(true);

      // Second call with fully valid data must not inherit errors
      const good = imageUploadValidation(validInput);
      expect(good.hasErrors()).toBe(false);
    });
  });

  describe('single-field scoping', () => {
    it('only runs tests for the scoped field', () => {
      const result = imageUploadValidation(
        { imageBase64: '', contentType: '' },
        'imageBase64'
      );
      expect(result.hasErrors('imageBase64')).toBe(true);
      expect(result.hasErrors('contentType')).toBe(false);
    });
  });
});
