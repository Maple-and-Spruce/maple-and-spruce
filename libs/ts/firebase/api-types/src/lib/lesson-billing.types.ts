/**
 * Lesson billing API contracts (#798).
 */
import type {
  CreateLessonBillingRuleInput,
  LessonBillingRule,
  LessonScheduledCharge,
} from '@maple/ts/domain';

export interface GetLessonBillingRequest {
  /** Narrow the charges to one student; rules always come back in full. */
  studentId?: string;
}

export interface GetLessonBillingResponse {
  rules: LessonBillingRule[];
  charges: LessonScheduledCharge[];
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
  dryRun: boolean;
}
