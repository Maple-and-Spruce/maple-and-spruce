/**
 * Get Class Waitlist Counts Cloud Function
 *
 * Returns a `classId -> waitlist count` map for every class in one call.
 * Admin-only, used by the classes-list "Waitlist" column so the count is
 * visible at a glance without opening each roster.
 *
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  createRoleFunction,
  Role,
} from '@maple/firebase/functions';
import { ClassWaitlistRepository } from '@maple/firebase/database';
import type {
  GetClassWaitlistCountsRequest,
  GetClassWaitlistCountsResponse,
} from '@maple/ts/firebase/api-types';

export const getClassWaitlistCounts = createRoleFunction<
  GetClassWaitlistCountsRequest,
  GetClassWaitlistCountsResponse
>(async () => {
  const counts = await ClassWaitlistRepository.countsByClass();
  return { counts };
}, [Role.Admin, Role.Clerk]);
