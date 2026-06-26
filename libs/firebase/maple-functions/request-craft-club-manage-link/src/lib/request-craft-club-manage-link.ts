/**
 * Request Craft Club Manage Link Cloud Function (public)
 *
 * Emails a member a single-use magic link to manage their membership. The
 * response is uniform whether or not the email is a member — we never reveal
 * who has a membership (no enumeration). Only when a member exists do we mint a
 * token and queue the email.
 *
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { Functions, throwInvalidArgument } from '@maple/firebase/functions';
import {
  CraftClubMemberRepository,
  CraftClubTokenRepository,
  getDb,
} from '@maple/firebase/database';
import type {
  RequestCraftClubManageLinkRequest,
  RequestCraftClubManageLinkResponse,
} from '@maple/ts/firebase/api-types';

export const requestCraftClubManageLink = Functions.endpoint
  .usingStrings('CRAFT_CLUB_MANAGE_URL')
  .handle<
    RequestCraftClubManageLinkRequest,
    RequestCraftClubManageLinkResponse
  >(async (data, _context, _secrets, strings) => {
    if (!data.email) throwInvalidArgument('Email is required');

    const member = await CraftClubMemberRepository.findByEmail(data.email);
    if (member) {
      const rawToken = await CraftClubTokenRepository.createAccessToken(
        member.email
      );
      const base = strings.CRAFT_CLUB_MANAGE_URL;
      const separator = base.includes('?') ? '&' : '?';
      const manageUrl = `${base}${separator}token=${rawToken}`;

      const db = getDb();
      await db.collection('mail').add({
        to: member.email,
        template: {
          name: 'craft-club-manage-link',
          data: { manageUrl },
        },
      });
    }

    // Always uniform — do not reveal whether the email is a member.
    return { ok: true };
  });
