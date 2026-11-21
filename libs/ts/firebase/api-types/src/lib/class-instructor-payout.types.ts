/**
 * Class-instructor payout API types — routes on the `payouts` router.
 *
 * Dates travel as ISO strings and are rehydrated by the client hook.
 */
import type {
  InstructorReadinessItem,
  ClassInstructorPaymentMethod,
  ClassInstructorStatement,
  ClassInstructorStatementDraft,
  ClassInstructorStatementStatus,
  StatementStaleReason,
} from '@maple/ts/domain';

/** A statement that has been generated and not yet marked paid. */
export interface PendingStatementSummary {
  id: string;
  totalOwedCents: number;
  /** `YYYY-MM-DD` (studio time): the first and last session it covers. */
  coversFrom?: string;
  coversTo?: string;
}

/**
 * Where one instructor stands: the finished sessions no statement has claimed
 * yet (as generate would see them), the statements waiting to be marked paid,
 * and what has been paid this year.
 */
export interface ClassInstructorPayoutPreview
  extends Omit<ClassInstructorStatementDraft, 'entries'> {
  /** Generated, not yet marked paid. Oldest first. */
  pendingStatements: PendingStatementSummary[];
  /**
   * Everything owed and not yet paid: the unclaimed sessions (`totalOwedCents`)
   * plus the pending statements.
   */
  owedCents: number;
  /** Marked paid in the current calendar year, by the day it was paid. */
  paidThisYearCents: number;
  /**
   * What a contract instructor is still missing to be cleared to teach, if
   * anything. A warning only: it never stops a statement being generated.
   */
  readinessMissing?: InstructorReadinessItem[];
}

export interface PreviewClassInstructorPayoutsRequest {
  /**
   * `YYYY-MM-DD` (studio time). Leave sessions held after this day for a
   * later statement. Omit for everything that has finished.
   */
  throughDate?: string;
}

export interface PreviewClassInstructorPayoutsResponse {
  /** Instructors with something unpaid, or something paid this year. */
  previews: ClassInstructorPayoutPreview[];
  /** The cutoff that was applied, if one was asked for. */
  throughDate?: string;
}

export interface GenerateClassInstructorStatementRequest {
  instructorId: string;
  /** `YYYY-MM-DD` (studio time). Omit to claim every finished, unclaimed session. */
  throughDate?: string;
}

export interface GenerateClassInstructorStatementResponse {
  statement: ClassInstructorStatement;
}

export interface GetClassInstructorStatementsRequest {
  instructorId?: string;
  month?: string;
  status?: ClassInstructorStatementStatus;
}

export interface GetClassInstructorStatementsResponse {
  statements: ClassInstructorStatement[];
  /**
   * Paid in the current calendar year, by instructor id — the figure to
   * check against the 1099-NEC threshold.
   */
  paidThisYearByInstructor: Record<string, number>;
  /**
   * Paid in every calendar year, by instructor id then year (`"2026"`), by
   * the day it was paid. Last year's figure is the one the 1099-NEC and the
   * workers' comp audit need in January.
   */
  paidByYearByInstructor: Record<string, Record<string, number>>;
}

export interface GetClassInstructorStatementRequest {
  id: string;
}

export interface GetClassInstructorStatementResponse {
  statement: ClassInstructorStatement;
  /** Non-empty when a pending statement no longer matches the data. */
  staleReasons: StatementStaleReason[];
}

export interface MarkClassInstructorStatementPaidRequest {
  id: string;
  /** `YYYY-MM-DD` */
  paidOn: string;
  paymentMethod: ClassInstructorPaymentMethod;
  paymentReference?: string;
}

export interface MarkClassInstructorStatementPaidResponse {
  statement: ClassInstructorStatement;
}

export interface VoidClassInstructorStatementRequest {
  id: string;
}

export interface VoidClassInstructorStatementResponse {
  statement: ClassInstructorStatement;
}
