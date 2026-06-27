/**
 * Admin Cancel Craft Club Subscription Cloud Function (admin-only, Square)
 *
 * Cancels a member's Square subscription at period end, marks the member
 * cancelled (access through the period end), and emails a confirmation.
 *
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  Functions,
  Role,
  throwInvalidArgument,
  throwNotFound,
  throwFailedPrecondition,
} from '@maple/firebase/functions';
import { Square, SQUARE_SECRET_NAMES, SQUARE_STRING_NAMES } from '@maple/firebase/square';
import { CraftClubMemberRepository, getDb } from '@maple/firebase/database';
import { formatCraftClubDate } from '@maple/ts/domain';
import type {
  AdminCraftClubSubscriptionActionRequest,
  AdminCraftClubSubscriptionActionResponse,
} from '@maple/ts/firebase/api-types';

export const adminCancelCraftClubSubscription = Functions.endpoint
  .usingSecrets(...SQUARE_SECRET_NAMES)
  .usingStrings(...SQUARE_STRING_NAMES)
  .requiringRole(Role.Admin)
  .handle<
    AdminCraftClubSubscriptionActionRequest,
    AdminCraftClubSubscriptionActionResponse
  >(async (data, _context, secrets, strings) => {
    if (!data.id) throwInvalidArgument('Member ID is required');

    const member = await CraftClubMemberRepository.findById(data.id);
    if (!member) throwNotFound('Craft Club member', data.id);
    if (!member.squareSubscriptionId) {
      throwFailedPrecondition('Member has no subscription to cancel.');
    }

    const square = new Square(secrets, strings);
    const result = await square.subscriptionsService.cancel(
      member.squareSubscriptionId
    );

    const updated = await CraftClubMemberRepository.update({
      id: member.id,
      status: 'cancelled',
      cancelledAt: new Date(),
      currentPeriodEndsAt: result.canceledDate
        ? new Date(result.canceledDate)
        : member.currentPeriodEndsAt,
    });

    await getDb()
      .collection('mail')
      .add({
        to: updated.email,
        template: {
          name: 'craft-club-cancelled',
          data: {
            name: updated.name ?? '',
            periodEnd: formatCraftClubDate(updated.currentPeriodEndsAt),
          },
        },
      });

    return { member: updated };
  });
