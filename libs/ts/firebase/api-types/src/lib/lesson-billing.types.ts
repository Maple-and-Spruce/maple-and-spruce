/**
 * Lesson billing API contracts (#81).
 */
import type {
  CreateLessonBillingRuleInput,
  LessonBillingRule,
  LessonRateByLength,
  LessonScheduledCharge,
} from '@maple/ts/domain';

export interface GetLessonBillingRequest {
  /** Narrow the charges to one student; rules always come back in full. */
  studentId?: string;
}

export interface GetLessonBillingResponse {
  rules: LessonBillingRule[];
  charges: LessonScheduledCharge[];
  /**
   * The studio rate table, so the screen can price a prepayment before taking
   * it (legacy #864). It travels with the charges rather than through a separate read
   * because the number the admin approves and the number the server charges
   * must come from the same source — a preview computed from a stale or absent
   * rate is how someone agrees to one amount and a family is charged another.
   */
  rateByLength: LessonRateByLength;
}

/** Create when `id` is absent, update when it is present. */
export type SaveLessonBillingRuleRequest = CreateLessonBillingRuleInput & {
  id?: string;
};

export interface SaveLessonBillingRuleResponse {
  rule: LessonBillingRule;
}

export interface UpdateLessonScheduledChargeRequest {
  id: string;
  /**
   * `cancelled` — the teaching is not going to happen.
   * `waived` — it happened and the studio is not charging for it.
   */
  status: 'cancelled' | 'waived';
  /** Required in practice for `waived`, so a comped block stays legible. */
  waivedReason?: string;
}

export interface UpdateLessonScheduledChargeResponse {
  charge: LessonScheduledCharge;
}

export interface RunLessonBillingRequest {
  /** Report what would happen without planning or taking anything. */
  dryRun?: boolean;
}

export interface RunLessonBillingResult {
  studentsConsidered: number;
  chargesPlanned: number;
  /** Already planned — the steady state, not a problem. */
  chargesAlreadyPlanned: number;
  charged: number;
  chargeFailed: number;
  /** Due charges skipped because the family has no card on file. */
  skippedNoCard: number;
  /**
   * Blocks skipped because no rate resolved for the student. Surfaced rather
   * than swallowed — a student nobody is billing is invisible otherwise.
   */
  skippedNoRate: number;
  /**
   * Lessons an existing charge already covers, so not planned again — usually
   * a family who paid ahead (legacy #864). Reported rather than left silent: once
   * covered lessons are filtered out before blocking, a steady-state run and a
   * run where planning quietly produced nothing look the same from outside.
   */
  lessonsAlreadyCovered: number;
  dryRun: boolean;
}

/**
 * Take money for a block of lessons right now (legacy #864).
 *
 * Either name the lessons, or say how many of the next uncovered ones to take.
 * Naming them wins when both are present.
 */
export interface ChargeLessonsNowRequest {
  studentId: string;
  /** Take these exact lessons. */
  lessonIds?: string[];
  /** Otherwise take this many of the next lessons nothing else covers. */
  lessonCount?: number;
  /**
   * The total the admin was shown. The charge is refused if the server prices
   * the same lessons differently — a rate change or a rescheduled lesson
   * between render and click must not quietly become a different amount than
   * the one a family agreed to at the desk.
   */
  expectedAmountCents?: number;
  /** What this covers, in the admin's words. */
  note?: string;
  /**
   * Retry a charge that failed, rather than planning a new one. The original
   * document and its idempotency key are reused, so an attempt that actually
   * reached Square comes back as the same payment instead of a second one.
   */
  retryChargeId?: string;
}

export interface ChargeLessonsNowResponse {
  charge: LessonScheduledCharge;
}
