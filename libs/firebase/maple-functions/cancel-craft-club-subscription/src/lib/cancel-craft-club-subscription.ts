/**
 * Cancel Craft Club Subscription Cloud Function (public, session-gated, Square)
 *
 * Self-service cancellation. Cancels the Square subscription at the end of the
 * current billing period (Square stops billing on the boundary), then marks the
 * member cancelled with access through the period end.
 *
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  Functions,
  throwFailedPrecondition,
} from '@maple/firebase/functions';
import { Square, SQUARE_SECRET_NAMES, SQUARE_STRING_NAMES } from '@maple/firebase/square';
import {
  CraftClubMemberRepository,
  CraftClubTokenRepository,
} from '@maple/firebase/database';
import { toCraftClubMemberPublicView } from '@maple/ts/domain';
import type {
  CancelCraftClubSubscriptionRequest,
  CancelCraftClubSubscriptionResponse,
} from '@maple/ts/firebase/api-types';

export const cancelCraftClubSubscription = Functions.endpoint
  .usingSecrets(...SQUARE_SECRET_NAMES)
  .usingStrings(...SQUARE_STRING_NAMES)
  .handle<
    CancelCraftClubSubscriptionRequest,
    CancelCraftClubSubscriptionResponse
  >(async (data, _context, secrets, strings) => {
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
    if (!member.squareSubscriptionId) {
      throwFailedPrecondition('No active subscription to cancel.');
    }

    const square = new Square(secrets, strings);
    const result = await square.subscriptionsService.cancel(
      member.squareSubscriptionId
    );

    const updated = await CraftClubMemberRepository.update({
      id: member.id,
      status: 'cancelled',
      cancelledAt: new Date(),
      // Access continues until the period end Square reports.
      currentPeriodEndsAt: result.canceledDate
        ? new Date(result.canceledDate)
        : member.currentPeriodEndsAt,
    });

    return { member: toCraftClubMemberPublicView(updated) };
  });
