/**
 * Update Instructor Cloud Function
 *
 * Updates an existing instructor (admin only).
 */
import {
  createAdminFunction,
  throwNotFound,
  throwFailedPrecondition,
} from '@maple/firebase/functions';
import { InstructorRepository } from '@maple/firebase/database';
import { instructorValidation } from '@maple/ts/validation';
import type {
  UpdateInstructorRequest,
  UpdateInstructorResponse,
} from '@maple/ts/firebase/api-types';

export const updateInstructor = createAdminFunction<
  UpdateInstructorRequest,
  UpdateInstructorResponse
>(async (data) => {
  // Check instructor exists
  const existing = await InstructorRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Instructor', data.id);
  }

  // Validate update data (merge with existing for full validation). uid is a
  // portal-login link, not a validated field, and may be null (unlink) — keep
  // it out of the validation merge so its type doesn't leak in.
  const { uid: _uid, ...dataForValidation } = data;
  const merged = { ...existing, ...dataForValidation };
  const validationResult = instructorValidation(merged);
  if (!validationResult.isValid()) {
    const errors = validationResult.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  // Check for duplicate email if email is being changed
  if (data.email && data.email !== existing.email) {
    const existingWithEmail = await InstructorRepository.findByEmail(data.email);
    if (existingWithEmail) {
      throw new Error(`An instructor with email ${data.email} already exists`);
    }
  }

  // A portal login (uid) links one user to one instructor — required for the
  // lesson-teacher "manage only your own lessons" check (#617 phase 2). Guard
  // uniqueness: a uid already linked to a different instructor must be
  // unlinked there first, or ownership would be ambiguous. `null` unlinks.
  if (data.uid) {
    const linkedElsewhere = await InstructorRepository.findByUid(data.uid);
    if (linkedElsewhere && linkedElsewhere.id !== data.id) {
      throwFailedPrecondition(
        `That portal user is already linked to instructor "${linkedElsewhere.name}". Unlink them there first.`
      );
    }
  }

  const instructor = await InstructorRepository.update(data);

  return { instructor };
});
