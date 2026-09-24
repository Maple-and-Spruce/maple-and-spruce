/**
 * Lesson billing rule validation (#107).
 *
 * A rule is a standing instruction to take money from families, so the checks on
 * it matter more than most. They were written by hand inside
 * `saveLessonBillingRule` and nowhere else, which was fine while no screen could
 * create a rule — and stopped being fine the moment one could: a form needs the
 * same answers, and a second copy of "what makes a rule valid" is how the screen
 * starts accepting something the server then refuses.
 *
 * `staticSuite`, so it is a pure function safe to call from a warm Cloud Function
 * container without `.reset()` (ADR-017).
 */
import { staticSuite, test, enforce, only } from 'vest';
import {
  LESSON_BILLING_ANCHORS,
  type CreateLessonBillingRuleInput,
} from '@maple/ts/domain';

/**
 * A charge should land near the teaching it pays for. Two weeks is generous for
 * "the day before the block starts" while still catching a typo that would bill
 * a family months out of step with their lessons.
 */
export const MAX_ANCHOR_OFFSET_DAYS = 14;

/** More than this in one charge is a typo, not a policy. */
export const MAX_LESSONS_PER_CHARGE = 24;

export const lessonBillingRuleValidation = staticSuite(
  (data: Partial<CreateLessonBillingRuleInput>, field?: string | string[]) => {
    only(field);

    test('name', 'A rule needs a name', () => {
      enforce(data.name).isNotBlank();
    });

    test('name', 'Keep the name under 80 characters', () => {
      enforce(data.name ?? '').shorterThan(80);
    });

    test('anchor', 'Choose when the charge is taken', () => {
      enforce(data.anchor).isNotBlank();
    });

    test('anchor', 'Unknown anchor', () => {
      const anchor = data.anchor;
      enforce(
        anchor === undefined || LESSON_BILLING_ANCHORS.includes(anchor)
      ).isTruthy();
    });

    // Only meaningful for `every-n-lessons`; `per-lesson` is always one.
    test('lessonsPerCharge', 'A charge has to cover at least one lesson', () => {
      enforce(
        data.cadence !== 'every-n-lessons' || (data.lessonsPerCharge ?? 0) >= 1
      ).isTruthy();
    });

    test(
      'lessonsPerCharge',
      `That is more than ${MAX_LESSONS_PER_CHARGE} lessons in one charge`,
      () => {
        enforce(
          data.cadence !== 'every-n-lessons' ||
            (data.lessonsPerCharge ?? 0) <= MAX_LESSONS_PER_CHARGE
        ).isTruthy();
      }
    );

    test('lessonsPerCharge', 'Lessons per charge must be a whole number', () => {
      enforce(
        data.lessonsPerCharge === undefined ||
          Number.isInteger(data.lessonsPerCharge)
      ).isTruthy();
    });

    test(
      'anchorOffsetDays',
      `A charge must land within ${MAX_ANCHOR_OFFSET_DAYS} days of the lesson it pays for`,
      () => {
        enforce(
          Math.abs(data.anchorOffsetDays ?? 0) <= MAX_ANCHOR_OFFSET_DAYS
        ).isTruthy();
      }
    );

    test('anchorOffsetDays', 'Days must be a whole number', () => {
      enforce(
        data.anchorOffsetDays === undefined ||
          Number.isInteger(data.anchorOffsetDays)
      ).isTruthy();
    });

    // Absent means "price from the covered lessons", which is the normal case.
    // Present and zero or negative would charge nothing, or refund by accident.
    test('flatAmountCents', 'A flat amount must be more than zero', () => {
      enforce(
        data.flatAmountCents === undefined || data.flatAmountCents > 0
      ).isTruthy();
    });
  }
);
