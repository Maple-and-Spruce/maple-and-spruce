/**
 * saveLessonBillingRule (#798) — create or update one billing rule.
 *
 * Create and update are one endpoint because the interesting work is identical:
 * a rule is a standing instruction to take money, so the same shape checks have
 * to run either way. Splitting them would double the surface to duplicate the
 * validation.
 *
 * Editing a rule reaches every student on it — that is the point of rules
 * existing. Charges **already planned** are not rewritten: a planned charge is a
 * stated amount on a stated date, and a policy change applies to what has not
 * been planned yet. To change one, waive or cancel that charge.
 */
import {
  Functions,
  Role,
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import { LessonBillingRuleRepository } from '@maple/firebase/database';
import { LESSON_BILLING_ANCHORS } from '@maple/ts/domain';
import type { LessonBillingRule } from '@maple/ts/domain';
import type {
  SaveLessonBillingRuleRequest,
  SaveLessonBillingRuleResponse,
} from '@maple/ts/firebase/api-types';

/**
 * A charge should land near the teaching it pays for. Two weeks is generous for
 * "the day before the block starts" while still catching a typo that would bill
 * a family months out of step with their lessons.
 */
const MAX_ANCHOR_OFFSET_DAYS = 14;

/** Shape checks that must hold whether the rule is new or edited. */
function assertValidRule(
  rule: Pick<
    LessonBillingRule,
    'name' | 'cadence' | 'lessonsPerCharge' | 'anchor' | 'anchorOffsetDays'
  > & { flatAmountCents?: number }
): void {
  if (!rule.name?.trim()) {
    throwInvalidArgument('A rule needs a name');
  }
  if (!LESSON_BILLING_ANCHORS.includes(rule.anchor)) {
    throwInvalidArgument(`Unknown anchor: ${rule.anchor}`);
  }
  if (rule.cadence === 'every-n-lessons' && rule.lessonsPerCharge < 1) {
    throwInvalidArgument('A charge has to cover at least one lesson');
  }
  if (Math.abs(rule.anchorOffsetDays) > MAX_ANCHOR_OFFSET_DAYS) {
    throwInvalidArgument(
      `A charge must land within ${MAX_ANCHOR_OFFSET_DAYS} days of the lesson it pays for`
    );
  }
  if (rule.flatAmountCents !== undefined && rule.flatAmountCents <= 0) {
    throwInvalidArgument('A flat amount must be more than zero');
  }
}

export const saveLessonBillingRule = Functions.endpoint
  .requiringRole(Role.Admin)
  .handle<SaveLessonBillingRuleRequest, SaveLessonBillingRuleResponse>(
    async (data) => {
      const { id, ...fields } = data;

      if (!id) {
        assertValidRule(fields);
        return { rule: await LessonBillingRuleRepository.create(fields) };
      }

      const existing = await LessonBillingRuleRepository.findById(id);
      if (!existing) throwNotFound('Lesson billing rule', id);

      // Validate the rule as it will be, not just the fields that changed —
      // an edit can make a previously-valid rule incoherent.
      assertValidRule({ ...existing, ...fields });

      const rule = await LessonBillingRuleRepository.update({ ...fields, id });
      if (!rule) throwNotFound('Lesson billing rule', id);
      return { rule };
    }
  );
