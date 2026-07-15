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

/** One configurable installment row from the admin form. */
export interface MusicTogetherInstallmentInput {
  amountCents?: number;
  dueAt?: Date | string;
}

export interface MusicTogetherSectionValidationInput {
  name?: string;
  description?: string;
  sessions?: MusicTogetherSessionInput[];
  capacityFamilies?: number;
  priceFullCents?: number;
  /**
   * Optional configurable installment plan. Absent/empty ⇒ pay-in-full only.
   * When present it must have 2+ rows (a single charge is just pay-in-full).
   */
  installmentPlan?: MusicTogetherInstallmentInput[];
  /** Explicit visibility/enrollment controls (status is derived, not stored). */
  visible?: boolean;
  enrollmentActive?: boolean;
  enrollmentOpensAt?: Date | string;
  enrollmentClosesAt?: Date | string;
}

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

    // Installment plan is optional. When offered it needs 2+ rows, each with a
    // positive amount and a valid due date, in ascending date order.
    test('installmentPlan', 'An installment plan must have at least 2 charges', () => {
      if (data.installmentPlan !== undefined && data.installmentPlan.length > 0) {
        enforce(data.installmentPlan.length).greaterThanOrEquals(2);
      }
    });

    test('installmentPlan', 'Each installment needs an amount greater than 0', () => {
      for (const item of data.installmentPlan ?? []) {
        enforce(item.amountCents).isNotNullish();
        if (item.amountCents !== undefined) {
          enforce(item.amountCents).greaterThan(0);
        }
      }
    });

    test('installmentPlan', 'Each installment needs a valid due date', () => {
      for (const item of data.installmentPlan ?? []) {
        enforce(parseDate(item.dueAt)).isNotNullish();
      }
    });

    test('installmentPlan', 'Installment due dates must be in ascending order', () => {
      const dates = (data.installmentPlan ?? [])
        .map((i) => parseDate(i.dueAt))
        .filter((d): d is Date => d !== undefined);
      for (let i = 1; i < dates.length; i++) {
        enforce(dates[i].getTime()).greaterThan(dates[i - 1].getTime());
      }
    });

    test('enrollmentOpensAt', 'Enrollment open date must be valid', () => {
      if (data.enrollmentOpensAt !== undefined) {
        enforce(parseDate(data.enrollmentOpensAt)).isNotNullish();
      }
    });

    test('enrollmentClosesAt', 'Enrollment close date must be valid', () => {
      if (data.enrollmentClosesAt !== undefined) {
        enforce(parseDate(data.enrollmentClosesAt)).isNotNullish();
      }
    });

    test(
      'enrollmentClosesAt',
      'Enrollment must close after it opens',
      () => {
        const opens = parseDate(data.enrollmentOpensAt);
        const closes = parseDate(data.enrollmentClosesAt);
        if (opens && closes) {
          enforce(closes.getTime()).greaterThan(opens.getTime());
        }
      }
    );
  }
);
