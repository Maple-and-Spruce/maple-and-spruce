/**
 * Start Craft Club Session Cloud Function (public)
 *
 * Exchanges a single-use magic-link token for a short-lived session. The
 * access token is consumed (marked used) so the link cannot be replayed; the
 * returned session token authorizes subsequent management calls.
 *
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  createPublicFunction,
  throwInvalidArgument,
  throwFailedPrecondition,
} from '@maple/firebase/functions';
import {
  CraftClubMemberRepository,
  CraftClubTokenRepository,
} from '@maple/firebase/database';
import { toCraftClubMemberPublicView } from '@maple/ts/domain';
import type {
  StartCraftClubSessionRequest,
  StartCraftClubSessionResponse,
} from '@maple/ts/firebase/api-types';

export const startCraftClubSession = createPublicFunction<
  StartCraftClubSessionRequest,
  StartCraftClubSessionResponse
>(async (data) => {
  if (!data.token) throwInvalidArgument('Token is required');

  const email = await CraftClubTokenRepository.consumeAccessToken(data.token);
  if (!email) {
    throwFailedPrecondition(
      'This link is invalid or has expired. Please request a new one.'
    );
  }

  const member = await CraftClubMemberRepository.findByEmail(email);
  if (!member) {
    throwFailedPrecondition('Membership not found.');
  }

  const sessionToken = await CraftClubTokenRepository.createSession(member.id);
  return { sessionToken, member: toCraftClubMemberPublicView(member) };
});
