/**
 * Class validation suite
 *
 * Vest validation for class/workshop forms.
 * @see https://vestjs.dev/
 */
import { create, test, enforce, only } from 'vest';
import type { CreateClassInput } from '@maple/ts/domain';

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
export const classValidation = create(
  (data: Partial<CreateClassInput>, field?: string) => {
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

    // DateTime validation
    test('dateTime', 'Date and time is required', () => {
      enforce(data.dateTime).isNotNullish();
    });

    test('dateTime', 'Class must be scheduled in the future', () => {
      if (data.dateTime) {
        const classDate = data.dateTime instanceof Date
          ? data.dateTime
          : new Date(data.dateTime);
        enforce(classDate.getTime()).greaterThan(Date.now());
      }
    });

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

    // Minimum age validation (optional)
    test('minimumAge', 'Minimum age must be between 0 and 100', () => {
      if (data.minimumAge !== undefined) {
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
  }
);
