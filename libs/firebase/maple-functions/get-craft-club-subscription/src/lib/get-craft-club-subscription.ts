/**
 * Get Craft Club Subscription Cloud Function (public, session-gated)
 *
 * Returns the member's customer-safe subscription view for the manage widget.
 * Reads the member record mirrored from Square (kept fresh by webhooks in a
 * later phase) — no Square call needed.
 *
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  createPublicFunction,
  throwFailedPrecondition,
} from '@maple/firebase/functions';
import {
  CraftClubMemberRepository,
  CraftClubTokenRepository,
} from '@maple/firebase/database';
import { toCraftClubMemberPublicView } from '@maple/ts/domain';
import type {
  GetCraftClubSubscriptionRequest,
  GetCraftClubSubscriptionResponse,
} from '@maple/ts/firebase/api-types';

export const getCraftClubSubscription = createPublicFunction<
  GetCraftClubSubscriptionRequest,
  GetCraftClubSubscriptionResponse
>(async (data) => {
  const memberId = await CraftClubTokenRepository.resolveSession(
    data.sessionToken
  );
  if (!memberId) {
    throwFailedPrecondition(
      'Your session has expired. Please request a new link.'
    );
  }

  const member = await CraftClubMemberRepository.findById(memberId);
  if (!member) {
    throwFailedPrecondition('Membership not found.');
  }

  return { member: toCraftClubMemberPublicView(member) };
});
