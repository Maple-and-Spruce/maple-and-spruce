/**
 * saveLessonBillingRule (#81) — create or update one billing rule.
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
  throwNotFound,
  throwValidationError,
} from '@maple/firebase/functions';
import { LessonBillingRuleRepository } from '@maple/firebase/database';
import { lessonBillingRuleValidation } from '@maple/ts/validation';
import type { CreateLessonBillingRuleInput } from '@maple/ts/domain';
import type {
  SaveLessonBillingRuleRequest,
  SaveLessonBillingRuleResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Shape checks that must hold whether the rule is new or edited.
 *
 * Through the shared Vest suite, not by hand: a rule is now created from a screen
 * as well as from a script, and two copies of "what makes a rule valid" is how
 * the form starts accepting something this endpoint then refuses (#107). The
 * limits themselves live with the suite.
 */
function assertValidRule(rule: Partial<CreateLessonBillingRuleInput>): void {
  const result = lessonBillingRuleValidation(rule);
  if (result.hasErrors()) {
    throwValidationError(result.getErrors());
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
