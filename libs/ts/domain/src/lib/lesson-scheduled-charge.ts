/**
 * A future card-on-file charge for a block of lessons (#798).
 *
 * Deliberately the same shape as `MusicTogetherScheduledCharge`: a status
 * lease, a stable idempotency key derived from the document id, and a cancel
 * guard. That trio is what makes "charge at most once" true rather than hoped
 * for, and it has already been proven on the MT installment path — reinventing
 * it here would mean re-earning that confidence.
 *
 * The document id comes from `plannedChargeId`, keyed on the **first lesson the
 * charge covers**. So re-planning finds the charge already there and does
 * nothing, and a family cannot be billed twice for one block of teaching
 * because a lesson moved.
 */

/**
 * `scheduled → charging → paid | failed`.
 *
 * `cancelled` and `waived` are terminal and set by a human: `cancelled` when
 * the teaching is not going to happen, `waived` when the studio decides not to
 * take the money. Both stop the charge job; they are separate because a comped
 * block has to stay legible on the record, exactly as on the MT side.
 */
export type LessonChargeStatus =
  | 'scheduled'
  | 'charging'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'waived';

/** Statuses the charge job must skip — already terminal, or in flight. */
export const LESSON_CHARGE_TERMINAL_STATUSES: readonly LessonChargeStatus[] = [
  'paid',
  'failed',
  'cancelled',
  'waived',
];

export interface LessonScheduledCharge {
  /** `chg-{studentId}-{firstLessonId}` — see `plannedChargeId`. */
  id: string;
  studentId: string;
  ruleId: string;
  /** The lessons this charge pays for, in date order. */
  lessonIds: string[];
  amountCents: number;
  /** When the money should move. */
  dueAt: Date;
  status: LessonChargeStatus;
  /**
   * Stable Square idempotency key derived from the document id — never
   * time-based. A retry with the same key returns the original payment instead
   * of taking a second one.
   */
  idempotencyKey: string;
  squarePaymentId?: string;
  /** Why it failed, surfaced to an admin rather than retried silently. */
  lastError?: string;
  /** Why it was waived, and by whom, so a comped block stays legible. */
  waivedReason?: string;
  waivedByUid?: string;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateLessonScheduledChargeInput = Omit<
  LessonScheduledCharge,
  'createdAt' | 'updatedAt' | 'status' | 'idempotencyKey'
> & { status?: LessonChargeStatus };

/** Derive the Square idempotency key. Never include a timestamp. */
export function lessonChargeIdempotencyKey(chargeId: string): string {
  return `lesson-${chargeId}`;
}

/** Is this charge due to be taken now? */
export function isLessonChargeDue(
  charge: Pick<LessonScheduledCharge, 'status' | 'dueAt'>,
  now: Date = new Date()
): boolean {
  return charge.status === 'scheduled' && charge.dueAt.getTime() <= now.getTime();
}
