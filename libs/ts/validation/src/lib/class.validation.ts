/**
 * Class validation suite
 *
 * Vest validation for class/workshop forms.
 * @see https://vestjs.dev/
 */
import { staticSuite, test, enforce, only } from 'vest';
import { GALLERY_IMAGE_MAX, type CreateClassInput } from '@maple/ts/domain';

/**
 * Validate class form data
 *
 * @param data - Partial class data to validate
 * @param field - Optional field to validate (for single-field validation)
 *
 * @example
 * // Full validation
 * const result = classValidation(formData);
 * if (result.isValid()) {
 *   // Submit form
 * }
 */
export const classValidation = staticSuite(
  (data: Partial<CreateClassInput>, field?: string | string[]) => {
    only(field);

    // Name validation
    test('name', 'Name is required', () => {
      enforce(data.name).isNotBlank();
    });

    test('name', 'Name must be at least 3 characters', () => {
      enforce(data.name).longerThanOrEquals(3);
    });

    test('name', 'Name must be less than 100 characters', () => {
      enforce(data.name).shorterThan(100);
    });

    // Description validation
    test('description', 'Description is required', () => {
      enforce(data.description).isNotBlank();
    });

    test('description', 'Description must be at least 20 characters', () => {
      enforce(data.description).longerThanOrEquals(20);
    });

    // Short description validation (optional)
    test('shortDescription', 'Short description must be less than 160 characters', () => {
      if (data.shortDescription) {
        enforce(data.shortDescription).shorterThanOrEquals(160);
      }
    });

    // Sessions validation — at least one session, all in the future
    test('sessions', 'At least one class date is required', () => {
      enforce(data.sessions).isArray();
      enforce(data.sessions?.length ?? 0).greaterThanOrEquals(1);
    });

    test('sessions', 'All class dates must be scheduled in the future', () => {
      if (Array.isArray(data.sessions) && data.sessions.length > 0) {
        const now = Date.now();
        const allFuture = data.sessions.every((s) => {
          const d = s.dateTime instanceof Date ? s.dateTime : new Date(s.dateTime);
          return d.getTime() > now;
        });
        enforce(allFuture).isTruthy();
      }
    });

    // Registration cutoff validation (optional)
    test(
      'registrationClosesAt',
      'Registration close must be before the first class session',
      () => {
        if (
          data.registrationClosesAt &&
          Array.isArray(data.sessions) &&
          data.sessions.length > 0
        ) {
          const cutoff =
            data.registrationClosesAt instanceof Date
              ? data.registrationClosesAt
              : new Date(data.registrationClosesAt);
          const firstSessionMs = Math.min(
            ...data.sessions.map((s) =>
              (s.dateTime instanceof Date ? s.dateTime : new Date(s.dateTime)).getTime()
            )
          );
          enforce(cutoff.getTime()).lessThanOrEquals(firstSessionMs);
        }
      }
    );

    test(
      'registrationClosesAt',
      'Registration close must be in the future',
      () => {
        if (data.registrationClosesAt) {
          const cutoff =
            data.registrationClosesAt instanceof Date
              ? data.registrationClosesAt
              : new Date(data.registrationClosesAt);
          enforce(cutoff.getTime()).greaterThan(Date.now());
        }
      }
    );

    // Duration validation
    test('durationMinutes', 'Duration is required', () => {
      enforce(data.durationMinutes).isNotNullish();
    });

    test('durationMinutes', 'Duration must be at least 30 minutes', () => {
      if (data.durationMinutes !== undefined) {
        enforce(data.durationMinutes).greaterThanOrEquals(30);
      }
    });

    test('durationMinutes', 'Duration must be less than 480 minutes (8 hours)', () => {
      if (data.durationMinutes !== undefined) {
        enforce(data.durationMinutes).lessThanOrEquals(480);
      }
    });

    // Capacity validation
    test('capacity', 'Capacity is required', () => {
      enforce(data.capacity).isNotNullish();
    });

    test('capacity', 'Capacity must be at least 1', () => {
      if (data.capacity !== undefined) {
        enforce(data.capacity).greaterThanOrEquals(1);
      }
    });

    test('capacity', 'Capacity must be less than 50', () => {
      if (data.capacity !== undefined) {
        enforce(data.capacity).lessThanOrEquals(50);
      }
    });

    // Price validation
    test('priceCents', 'Price is required', () => {
      enforce(data.priceCents).isNotNullish();
    });

    test('priceCents', 'Price must be at least $0', () => {
      if (data.priceCents !== undefined) {
        enforce(data.priceCents).greaterThanOrEquals(0);
      }
    });

    test('priceCents', 'Price cannot exceed $10,000', () => {
      if (data.priceCents !== undefined) {
        enforce(data.priceCents).lessThanOrEquals(1000000);
      }
    });

    // Skill level validation
    test('skillLevel', 'Skill level is required', () => {
      enforce(data.skillLevel).isNotBlank();
    });

    test('skillLevel', 'Skill level must be valid', () => {
      if (data.skillLevel) {
        enforce(data.skillLevel).inside([
          'beginner',
          'intermediate',
          'advanced',
          'all-levels',
        ]);
      }
    });

    // Status validation
    test('status', 'Status is required', () => {
      enforce(data.status).isNotBlank();
    });

    test('status', 'Status must be valid', () => {
      if (data.status) {
        enforce(data.status).inside([
          'draft',
          'published',
          'cancelled',
          'completed',
        ]);
      }
    });

    // Instructor validation (required when published)
    test('instructorId', 'Instructor is required for published classes', () => {
      if (data.status === 'published') {
        enforce(data.instructorId).isNotBlank();
      }
    });

    // Minimum age validation (optional)
    test('minimumAge', 'Minimum age must be between 0 and 100', () => {
      if (data.minimumAge !== undefined && data.minimumAge !== null) {
        enforce(data.minimumAge).greaterThanOrEquals(0);
        enforce(data.minimumAge).lessThanOrEquals(100);
      }
    });

    // Materials included validation (optional)
    test('materialsIncluded', 'Materials included must be less than 500 characters', () => {
      if (data.materialsIncluded) {
        enforce(data.materialsIncluded).shorterThanOrEquals(500);
      }
    });

    // What to bring validation (optional)
    test('whatToBring', 'What to bring must be less than 500 characters', () => {
      if (data.whatToBring) {
        enforce(data.whatToBring).shorterThanOrEquals(500);
      }
    });

    // Gallery images validation (optional)
    test(
      'galleryImages',
      `Gallery is limited to ${GALLERY_IMAGE_MAX} images`,
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
