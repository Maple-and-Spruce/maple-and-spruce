/**
 * Update Craft Club Member Cloud Function
 *
 * Admin-only edit of a member record — notes, contact details, or a status
 * change such as revoking approval (`approved` → `requested`/`cancelled`).
 *
 * Square-affecting lifecycle actions (pause/resume/cancel the live Square
 * subscription) are separate functions introduced in a later phase; this one
 * only edits the local record.
 *
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  createAdminFunction,
  throwInvalidArgument,
  throwNotFound,
  throwValidationError,
} from '@maple/firebase/functions';
import { CraftClubMemberRepository } from '@maple/firebase/database';
import type { UpdateCraftClubMemberInput } from '@maple/ts/domain';
import { craftClubMemberValidation } from '@maple/ts/validation';
import type {
  UpdateCraftClubMemberRequest,
  UpdateCraftClubMemberResponse,
} from '@maple/ts/firebase/api-types';

export const updateCraftClubMember = createAdminFunction<
  UpdateCraftClubMemberRequest,
  UpdateCraftClubMemberResponse
>(async (data) => {
  if (!data.id) throwInvalidArgument('Member ID is required');

  const existing = await CraftClubMemberRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Craft Club member', data.id);
  }

  // Validate only the contact fields that were supplied (status is an enum the
  // API type already constrains). Email is immutable and not part of updates.
  const validatableFields = Object.keys(data).filter(
    (key) => key === 'name' || key === 'phone' || key === 'notes'
  );
  if (validatableFields.length > 0) {
    const result = craftClubMemberValidation(
      { ...existing, ...data },
      validatableFields
    );
    if (result.hasErrors()) {
      throwValidationError(result.getErrors());
    }
  }

  const updates: UpdateCraftClubMemberInput = { id: data.id };
  if (data.status !== undefined) updates.status = data.status;
  if (data.notes !== undefined) updates.notes = data.notes;
  if (data.name !== undefined) updates.name = data.name;
  if (data.phone !== undefined) updates.phone = data.phone;

  const member = await CraftClubMemberRepository.update(updates);
  return { member };
});
