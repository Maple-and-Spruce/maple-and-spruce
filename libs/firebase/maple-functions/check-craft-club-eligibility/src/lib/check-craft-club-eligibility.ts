/**
 * Check Craft Club Eligibility Cloud Function (public)
 *
 * Signup-gate lookup for the Webflow widget: given an email, returns a coarse
 * status so the widget can branch to the payment form (approved), a "you're
 * already a member → manage" link (active), or a request-access form (unknown).
 *
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  createPublicFunction,
  throwInvalidArgument,
} from '@maple/firebase/functions';
import { CraftClubMemberRepository } from '@maple/firebase/database';
import { isCraftClubMemberActive } from '@maple/ts/domain';
import type {
  CheckCraftClubEligibilityRequest,
  CheckCraftClubEligibilityResponse,
  CraftClubEligibilityStatus,
} from '@maple/ts/firebase/api-types';

export const checkCraftClubEligibility = createPublicFunction<
  CheckCraftClubEligibilityRequest,
  CheckCraftClubEligibilityResponse
>(async (data) => {
  if (!data.email) throwInvalidArgument('Email is required');

  const member = await CraftClubMemberRepository.findByEmail(data.email);
  if (!member) {
    return { status: 'unknown', alreadyMember: false };
  }

  const alreadyMember = isCraftClubMemberActive(member);

  let status: CraftClubEligibilityStatus;
  if (alreadyMember) {
    status = 'active';
  } else if (member.status === 'requested') {
    status = 'requested';
  } else if (member.status === 'approved' || member.status === 'cancelled') {
    // Cancelled members were approved before and may re-subscribe.
    status = 'approved';
  } else {
    // paused — admin-managed; not self-serviceable from the widget.
    status = 'unknown';
  }

  return { status, alreadyMember };
});
