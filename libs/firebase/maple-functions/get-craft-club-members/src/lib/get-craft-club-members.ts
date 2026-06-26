/**
 * Get Craft Club Members Cloud Function
 *
 * Admin-only listing of Craft Club members, optionally filtered by status.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { CraftClubMemberRepository } from '@maple/firebase/database';
import type {
  GetCraftClubMembersRequest,
  GetCraftClubMembersResponse,
} from '@maple/ts/firebase/api-types';

export const getCraftClubMembers = createAdminFunction<
  GetCraftClubMembersRequest,
  GetCraftClubMembersResponse
>(async (data) => {
  const members = await CraftClubMemberRepository.findAll({
    status: data.status,
  });

  return { members };
});
