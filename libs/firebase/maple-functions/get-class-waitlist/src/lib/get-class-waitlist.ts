/**
 * Get Class Waitlist Cloud Function
 *
 * Returns the waitlist entries for a class plus a total count. Admin-only,
 * used by the portal class roster page. The class waitlist is an informal
 * broadcast list (email + signup time only), so entries are returned ordered
 * earliest-signup-first for a stable display.
 *
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  createRoleFunction,
  throwInvalidArgument,
  Role,
} from '@maple/firebase/functions';
import { ClassWaitlistRepository } from '@maple/firebase/database';
import type {
  GetClassWaitlistRequest,
  GetClassWaitlistResponse,
} from '@maple/ts/firebase/api-types';

export const getClassWaitlist = createRoleFunction<
  GetClassWaitlistRequest,
  GetClassWaitlistResponse
>(async (data) => {
  if (!data.classId) throwInvalidArgument('Class ID is required');

  const entries = await ClassWaitlistRepository.findByClassId(data.classId);

  // Stored keyed by email with no inherent order — sort by signup time so the
  // portal shows a stable, meaningful "who joined first" list.
  entries.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return { entries, count: entries.length };
}, [Role.Admin, Role.Clerk]);
