/**
 * Request Craft Club Access Cloud Function (public)
 *
 * Captures a non-approved email as a pending access request (status
 * `requested`) so an admin can approve it later — we don't lose interested
 * people. Idempotent by email: re-requesting never duplicates a record, and an
 * already-approved/active email is reported back as such.
 *
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  createPublicFunction,
  throwValidationError,
} from '@maple/firebase/functions';
import { CraftClubMemberRepository } from '@maple/firebase/database';
import {
  isCraftClubMemberActive,
  canSubscribeToCraftClub,
} from '@maple/ts/domain';
import { craftClubMemberValidation } from '@maple/ts/validation';
import type {
  RequestCraftClubAccessRequest,
  RequestCraftClubAccessResponse,
} from '@maple/ts/firebase/api-types';

export const requestCraftClubAccess = createPublicFunction<
  RequestCraftClubAccessRequest,
  RequestCraftClubAccessResponse
>(async (data) => {
  const result = craftClubMemberValidation({
    email: data.email,
    name: data.name,
    phone: data.phone,
  });
  if (result.hasErrors()) {
    throwValidationError(result.getErrors());
  }

  const existing = await CraftClubMemberRepository.findByEmail(data.email);
  if (existing) {
    if (isCraftClubMemberActive(existing)) return { status: 'active' };
    if (canSubscribeToCraftClub(existing)) return { status: 'approved' };
    // requested or paused — leave as-is.
    return { status: 'requested' };
  }

  await CraftClubMemberRepository.create({
    email: data.email,
    name: data.name,
    phone: data.phone,
    status: 'requested',
  });

  return { status: 'requested' };
});
