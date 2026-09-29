/**
 * Class-instructor payout API types — routes on the `payouts` router.
 *
 * Dates travel as ISO strings and are rehydrated by the client hook.
 */
import type {
  ClassInstructorPaymentMethod,
  ClassInstructorStatement,
  ClassInstructorStatementDraft,
  ClassInstructorStatementStatus,
  StatementStaleReason,
} from '@maple/ts/domain';

/** An instructor's unclaimed earnings for a month, as generate would see them. */
export interface ClassInstructorPayoutPreview
  extends Omit<ClassInstructorStatementDraft, 'entries'> {
  /** The live (pending or paid) statement already generated for this month, if any. */
  existingStatement?: Pick<ClassInstructorStatement, 'id' | 'status' | 'totalOwedCents'>;
}

export interface PreviewClassInstructorPayoutsRequest {
  /** `YYYY-MM` */
  month: string;
}

export interface PreviewClassInstructorPayoutsResponse {
  /** Only instructors with something to show for the month. */
  previews: ClassInstructorPayoutPreview[];
  /** Whether every day of the month is past, so statements may be generated. */
  monthIsOver: boolean;
}

export interface GenerateClassInstructorStatementRequest {
  instructorId: string;
  /** `YYYY-MM` */
  month: string;
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
