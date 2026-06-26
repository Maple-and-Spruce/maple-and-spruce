/**
 * Approve Craft Club Member Cloud Function
 *
 * Admin-only pre-approval of an email for the Craft Club. Upserts by email:
 * a new email becomes an `approved` record; an existing `requested` record is
 * promoted to `approved`. An already-subscribed member keeps their status —
 * approval just records who/when and merges any supplied contact details.
 *
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  createAdminFunction,
  throwInvalidArgument,
  throwValidationError,
} from '@maple/firebase/functions';
import { CraftClubMemberRepository } from '@maple/firebase/database';
import { isCraftClubMemberActive } from '@maple/ts/domain';
import { craftClubMemberValidation } from '@maple/ts/validation';
import type {
  ApproveCraftClubMemberRequest,
  ApproveCraftClubMemberResponse,
} from '@maple/ts/firebase/api-types';

export const approveCraftClubMember = createAdminFunction<
  ApproveCraftClubMemberRequest,
  ApproveCraftClubMemberResponse
>(async (data, context) => {
  if (!context.uid) throwInvalidArgument('Authentication required');

  const result = craftClubMemberValidation({
    email: data.email,
    name: data.name,
    phone: data.phone,
    notes: data.notes,
  });
  if (result.hasErrors()) {
    throwValidationError(result.getErrors());
  }

  const now = new Date();
  const existing = await CraftClubMemberRepository.findByEmail(data.email);

  if (existing) {
    const member = await CraftClubMemberRepository.update({
      id: existing.id,
      // Never downgrade a live subscriber; otherwise (re)mark as approved.
      status: isCraftClubMemberActive(existing) ? existing.status : 'approved',
      approvedAt: existing.approvedAt ?? now,
      approvedBy: existing.approvedBy ?? context.uid,
      ...(data.name ? { name: data.name } : {}),
      ...(data.phone ? { phone: data.phone } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    });
    return { member };
  }

  const member = await CraftClubMemberRepository.create({
    email: data.email,
    name: data.name,
    phone: data.phone,
    status: 'approved',
    approvedAt: now,
    approvedBy: context.uid,
    notes: data.notes,
  });

  return { member };
});
