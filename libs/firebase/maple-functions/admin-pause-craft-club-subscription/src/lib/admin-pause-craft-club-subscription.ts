/**
 * Admin Pause Craft Club Subscription Cloud Function (admin-only, Square)
 *
 * Pauses Square billing for a member's subscription and mirrors the paused
 * state onto the member record. Resume with adminResumeCraftClubSubscription.
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
import { CraftClubMemberRepository } from '@maple/firebase/database';
import type {
  AdminCraftClubSubscriptionActionRequest,
  AdminCraftClubSubscriptionActionResponse,
} from '@maple/ts/firebase/api-types';

export const adminPauseCraftClubSubscription = Functions.endpoint
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
      throwFailedPrecondition('Member has no subscription to pause.');
    }

    const square = new Square(secrets, strings);
    await square.subscriptionsService.pause(member.squareSubscriptionId);

    const updated = await CraftClubMemberRepository.update({
      id: member.id,
      status: 'paused',
    });
    return { member: updated };
  });
