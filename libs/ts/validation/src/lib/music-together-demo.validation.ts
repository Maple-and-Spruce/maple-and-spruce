/**
 * Music Together demo-class validation suite
 *
 * Vest validation for the admin demo form (create/edit). Mirrors the section
 * suite's partial-field pattern so an update can validate only the changed
 * fields. A demo is a free, dated, capacity-gated try-a-class at a free-text
 * location (often offsite).
 *
 * @see https://vestjs.dev/
 */
import { staticSuite, test, enforce, only } from 'vest';

export interface MusicTogetherDemoValidationInput {
  dateTime?: Date | string;
  location?: string;
  capacityFamilies?: number;
  durationMinutes?: number;
  notes?: string;
  visible?: boolean;
}

function parseDate(value: Date | string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

export const musicTogetherDemoValidation = staticSuite(
  (data: MusicTogetherDemoValidationInput, field?: string | string[]) => {
    only(field);

    test('dateTime', 'A date and time is required', () => {
      enforce(parseDate(data.dateTime)).isNotNullish();
    });

    test('location', 'Location is required', () => {
      enforce(data.location).isNotBlank();
    });
    test('location', 'Location must be less than 200 characters', () => {
      if (data.location) enforce(data.location).shorterThan(200);
    });

    test('capacityFamilies', 'Capacity is required', () => {
      enforce(data.capacityFamilies).isNotNullish();
    });
    test('capacityFamilies', 'Capacity must be a whole number of at least 1', () => {
      if (data.capacityFamilies !== undefined) {
        enforce(data.capacityFamilies).greaterThanOrEquals(1);
        enforce(Number.isInteger(data.capacityFamilies)).isTruthy();
      }
    });

    test('durationMinutes', 'Duration must be greater than 0', () => {
      if (data.durationMinutes !== undefined) {
        enforce(data.durationMinutes).greaterThan(0);
      }
    });

    test('notes', 'Notes must be less than 1000 characters', () => {
      if (data.notes) enforce(data.notes).shorterThan(1000);
    });
  }
);
