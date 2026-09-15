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

/**
 * Who initiated the charge. `manual` is a human charging on the spot; anything
 * planned by the daily job leaves this unset.
 */
export type LessonChargeSource = 'manual';

/**
 * The `ruleId` a manual charge carries.
 *
 * `ruleId` is required on every charge, and a manual one was not produced by a
 * rule. A sentinel rather than an optional field so that every reader — the
 * charges screen, a future payout report — still finds a value there and can
 * say plainly where the charge came from.
 */
export const MANUAL_CHARGE_RULE_ID = 'manual';

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
  /**
   * How the charge came about. Absent means the daily billing job planned it;
   * `manual` means a human took it on the spot, usually a family paying ahead
   * for a block of lessons (#864).
   *
   * It is the same document either way, deliberately — a manual charge is the
   * same money for the same teaching, and a second ledger for it would split
   * every downstream reader in two (epic #626).
   */
  source?: LessonChargeSource;
  /** Who took it, when a human did. */
  chargedByUid?: string;
  /** What the admin said it was for, so a prepaid block stays legible. */
  note?: string;
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

/**
 * Statuses whose charge still speaks for the lessons it names.
 *
 * Everything except `failed`: a scheduled or in-flight charge is about to take
 * the money, a paid one took it, and `waived`/`cancelled` are a human saying
 * the studio is not charging for that teaching. Re-planning any of them would
 * bill a family for lessons already settled one way or another.
 *
 * `failed` is the exception on purpose. It collected nothing, so those lessons
 * are still owed — and a human retrying by hand (#864) is exactly the intended
 * recovery. It keeps its document and its idempotency key; the retry reuses
 * both, so a charge that actually went through at Square comes back as the
 * original payment rather than a second one.
 */
export const LESSON_CHARGE_COVERING_STATUSES: readonly LessonChargeStatus[] = [
  'scheduled',
  'charging',
  'paid',
  'waived',
  'cancelled',
];

/** Does this charge still speak for the lessons it names? */
export function chargeCoversItsLessons(
  charge: Pick<LessonScheduledCharge, 'status'>
): boolean {
  return LESSON_CHARGE_COVERING_STATUSES.includes(charge.status);
}

/**
 * Every lesson id already spoken for by an existing charge.
 *
 * This is what stops a family being billed twice for one lesson. Matching on
 * the **lessons** rather than on the charge id matters: a block's deterministic
 * id is keyed on its first lesson, so if that lesson is cancelled the block
 * re-forms around a different one and earns a different id — at which point the
 * id alone no longer recognises the overlap, but the lesson ids still do.
 */
export function coveredLessonIds(
  charges: Array<Pick<LessonScheduledCharge, 'status' | 'lessonIds'>>
): Set<string> {
  const covered = new Set<string>();
  for (const charge of charges) {
    if (!chargeCoversItsLessons(charge)) continue;
    for (const id of charge.lessonIds) covered.add(id);
  }
  return covered;
}
