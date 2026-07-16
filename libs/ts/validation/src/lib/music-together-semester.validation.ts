/**
 * Music Together semester validation suite
 *
 * Vest validation for the admin semester form (create/edit). Mirrors the
 * partial-field pattern so an update can validate only the changed fields.
 *
 * @see https://vestjs.dev/
 */
import { staticSuite, test, enforce, only } from 'vest';

/** One break row from the admin form. */
export interface MusicTogetherSemesterBreakInput {
  label?: string;
  startDate?: Date | string;
  endDate?: Date | string;
}

export interface MusicTogetherSemesterValidationInput {
  name?: string;
  season?: string;
  year?: number;
  startDate?: Date | string;
  endDate?: Date | string;
  weeks?: number;
  breaks?: MusicTogetherSemesterBreakInput[];
  weatherMakeupDates?: (Date | string)[];
  enrollmentOpensAt?: Date | string;
  notes?: string;
}

const SEASONS = ['fall', 'winter', 'spring', 'summer'];

function parseDate(value: Date | string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

export const musicTogetherSemesterValidation = staticSuite(
  (data: MusicTogetherSemesterValidationInput, field?: string | string[]) => {
    only(field);

    test('name', 'Name is required', () => {
      enforce(data.name).isNotBlank();
    });
    test('name', 'Name must be less than 100 characters', () => {
      if (data.name) enforce(data.name).shorterThan(100);
    });

    test('season', 'Season must be fall, winter, spring, or summer', () => {
      enforce(data.season).inside(SEASONS);
    });

    test('year', 'Year must be a reasonable value', () => {
      enforce(data.year).isNotNullish();
      if (data.year !== undefined) {
        enforce(data.year).greaterThanOrEquals(2020);
        enforce(data.year).lessThanOrEquals(2100);
      }
    });

    test('weeks', 'Weeks must be at least 1', () => {
      if (data.weeks !== undefined) {
        enforce(data.weeks).greaterThanOrEquals(1);
      }
    });

    // start/end are optional (a planned term may not have dates yet), but when
    // both are present, end must not precede start.
    test('endDate', 'End date must be on or after the start date', () => {
      const start = parseDate(data.startDate);
      const end = parseDate(data.endDate);
      if (start && end) {
        enforce(end.getTime()).greaterThanOrEquals(start.getTime());
      }
    });

    test('breaks', 'Each break needs a label and valid start/end dates', () => {
      for (const b of data.breaks ?? []) {
        enforce(b.label).isNotBlank();
        enforce(parseDate(b.startDate)).isNotNullish();
        enforce(parseDate(b.endDate)).isNotNullish();
      }
    });

    test('breaks', 'Each break end must be on or after its start', () => {
      for (const b of data.breaks ?? []) {
        const start = parseDate(b.startDate);
        const end = parseDate(b.endDate);
        if (start && end) {
          enforce(end.getTime()).greaterThanOrEquals(start.getTime());
        }
      }
    });

    test('weatherMakeupDates', 'Each weather makeup date must be valid', () => {
      for (const d of data.weatherMakeupDates ?? []) {
        enforce(parseDate(d)).isNotNullish();
      }
    });
  }
);
