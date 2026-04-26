/**
 * Class Category validation suite
 *
 * Vest validation for class category forms.
 * @see https://vestjs.dev/
 */
import { staticSuite, test, enforce, only } from 'vest';
import {
  GALLERY_IMAGE_MAX,
  type CreateClassCategoryInput,
} from '@maple/ts/domain';

/**
 * Validate class category form data
 *
 * @param data - Partial class category data to validate
 * @param field - Optional field to validate (for single-field validation)
 *
 * @example
 * // Full validation
 * const result = classCategoryValidation(formData);
 * if (result.isValid()) {
 *   // Submit form
 * }
 */
export const classCategoryValidation = staticSuite(
  (data: Partial<CreateClassCategoryInput>, field?: string | string[]) => {
    only(field);

    test('name', 'Name is required', () => {
      enforce(data.name).isNotBlank();
    });

    test('name', 'Name must be at least 2 characters', () => {
      enforce(data.name).longerThanOrEquals(2);
    });

    test('name', 'Name must be at most 50 characters', () => {
      enforce(data.name).shorterThanOrEquals(50);
    });

    test('order', 'Display order is required', () => {
      enforce(data.order).isNotNullish();
    });

    test('order', 'Display order must be non-negative', () => {
      if (data.order !== undefined) {
        enforce(data.order).greaterThanOrEquals(0);
      }
    });

    test('description', 'Description must be at most 200 characters', () => {
      if (data.description) {
        enforce(data.description).shorterThanOrEquals(200);
      }
    });

    test(
      'galleryImages',
      `Gallery pool is limited to ${GALLERY_IMAGE_MAX} images`,
      () => {
        if (Array.isArray(data.galleryImages)) {
          enforce(data.galleryImages.length).lessThanOrEquals(GALLERY_IMAGE_MAX);
        }
      }
    );

    test(
      'galleryImages',
      'Every gallery image needs a URL and a description for accessibility',
      () => {
        if (Array.isArray(data.galleryImages)) {
          const allValid = data.galleryImages.every(
            (img) =>
              typeof img?.url === 'string' &&
              img.url.trim().length > 0 &&
              typeof img?.alt === 'string' &&
              img.alt.trim().length > 0
          );
          enforce(allValid).isTruthy();
        }
      }
    );
  }
);
