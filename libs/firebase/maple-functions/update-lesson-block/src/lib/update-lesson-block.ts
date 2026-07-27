/**
 * Update Lesson Block Cloud Function (#686)
 *
 * Admin-only. Edits a block's weekday/window/label (the teacher can't be
 * reassigned — delete + recreate instead). Existing lessons keep their
 * `blockId`; any that no longer fit the narrowed window surface as
 * "unattributed" for an admin to resolve.
 */
import {
  createAdminFunction,
  throwInvalidArgument,
  throwNotFound,
  throwValidationError,
} from '@maple/firebase/functions';
import { LessonBlockRepository } from '@maple/firebase/database';
import { lessonBlockValidation } from '@maple/ts/validation';
import type {
  UpdateLessonBlockRequest,
  UpdateLessonBlockResponse,
} from '@maple/ts/firebase/api-types';

export const updateLessonBlock = createAdminFunction<
  UpdateLessonBlockRequest,
  UpdateLessonBlockResponse
>(async (data) => {
  if (!data.id) throwInvalidArgument('Block ID is required');

  const existing = await LessonBlockRepository.findById(data.id);
  if (!existing) throwNotFound('LessonBlock', data.id);

  // Partial validation: only the changed fields, merged over the existing block
  // for cross-field checks (end > start). Gate on hasErrors() — `only()` makes
  // per-field isValid() unreliable.
  const fields = Object.keys(data).filter((key) => key !== 'id');
  if (fields.length > 0) {
    const result = lessonBlockValidation({ ...existing, ...data }, fields);
    if (result.hasErrors()) {
      throwValidationError(result.getErrors());
    }
  }

  const block = await LessonBlockRepository.update(data);
  return { block };
});
