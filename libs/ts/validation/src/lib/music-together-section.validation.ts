/**
 * Music Together section validation suite
 *
 * Vest validation for the admin section form (create/edit). Mirrors the
 * partial-field pattern so an update can validate only the changed fields.
 *
 * @see https://vestjs.dev/
 */
import { staticSuite, test, enforce, only } from 'vest';

/** One session row; `dateTime` may arrive as a Date or ISO string. */
export interface MusicTogetherSessionInput {
  dateTime?: Date | string;
}

export interface MusicTogetherSectionValidationInput {
  name?: string;
  description?: string;
  sessions?: MusicTogetherSessionInput[];
  capacityFamilies?: number;
  priceFullCents?: number;
  installmentCents?: number;
  installmentCount?: number;
  week5ChargeAt?: Date | string;
  status?: string;
}

const SECTION_STATUSES = ['draft', 'open', 'closed', 'completed'];

function parseDate(value: Date | string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

export const musicTogetherSectionValidation = staticSuite(
  (data: MusicTogetherSectionValidationInput, field?: string | string[]) => {
    only(field);

    test('name', 'Name is required', () => {
      enforce(data.name).isNotBlank();
    });
    test('name', 'Name must be less than 150 characters', () => {
      if (data.name) enforce(data.name).shorterThan(150);
    });

    test('sessions', 'At least one session is required', () => {
      enforce(data.sessions ?? []).longerThanOrEquals(1);
    });
    test('sessions', 'Each session needs a valid date and time', () => {
      for (const s of data.sessions ?? []) {
        enforce(parseDate(s.dateTime)).isNotNullish();
      }
    });

    test('capacityFamilies', 'Capacity must be at least 1', () => {
      if (data.capacityFamilies !== undefined) {
        enforce(data.capacityFamilies).greaterThanOrEquals(1);
      }
    });

    test('priceFullCents', 'Full price must be greater than 0', () => {
      if (data.priceFullCents !== undefined) {
        enforce(data.priceFullCents).greaterThan(0);
      }
    });

    test('installmentCents', 'Installment amount must be greater than 0', () => {
      if (data.installmentCents !== undefined) {
        enforce(data.installmentCents).greaterThan(0);
      }
    });

    test('installmentCount', 'Installment count must be at least 1', () => {
      if (data.installmentCount !== undefined) {
        enforce(data.installmentCount).greaterThanOrEquals(1);
      }
    });

    test('week5ChargeAt', 'A valid second-installment charge date is required', () => {
      enforce(parseDate(data.week5ChargeAt)).isNotNullish();
    });

    test('status', 'Status must be valid', () => {
      if (data.status !== undefined) {
        enforce(data.status).inside(SECTION_STATUSES);
      }
    });
  }
);
