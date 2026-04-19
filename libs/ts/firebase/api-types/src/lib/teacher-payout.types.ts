/**
 * Teacher payout API types (#283).
 *
 * `getTeacherPayouts` aggregates what Katie owes each teacher in a
 * period from existing data — no new Firestore collection.
 */
import type { TeacherPayout } from '@maple/ts/domain';

export interface GetTeacherPayoutsRequest {
  /** Inclusive start of the period (ISO string over the wire). */
  from: string;
  /** Inclusive end of the period (ISO string over the wire). */
  to: string;
  /** Optional: limit to a single teacher. */
  teacherId?: string;
}

export interface GetTeacherPayoutsResponse {
  payouts: TeacherPayout[];
}
