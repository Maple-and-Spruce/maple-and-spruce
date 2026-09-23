/**
 * A future card-on-file charge for a block of lessons (#81).
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
   * for a block of lessons (legacy #864).
   *
   * It is the same document either way, deliberately — a manual charge is the
   * same money for the same teaching, and a second ledger for it would split
   * every downstream reader in two (epic #51).
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

/**
 * Square rejects an `idempotency_key` longer than this, and says so in a way
 * that reads like a decline: `Field must not be greater than 45 length`.
 */
export const MAX_SQUARE_IDEMPOTENCY_KEY_LENGTH = 45;

/**
 * FNV-1a, 64-bit, as 16 lowercase hex characters.
 *
 * Hand-rolled because this lib is isomorphic — the admin app imports it — so
 * `node:crypto` is not available, and a hashing dependency for one 16-character
 * digest is not worth the install. Collision resistance is not the job here:
 * two different charge ids colliding would mean Square returning the wrong
 * original payment, and at 64 bits that needs billions of charges before it is
 * worth thinking about.
 */
function fnv1a64Hex(input: string): string {
  const PRIME = 0x100000001b3n;
  const MASK = 0xffffffffffffffffn;
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * PRIME) & MASK;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * Derive the Square idempotency key. Never include a timestamp.
 *
 * A charge id carries a student id and a lesson id, and a materialised lesson
 * id is itself `sched-{scheduleId}-{YYYY-MM-DD}`. Spelling all that out ran to
 * 52–69 characters, over Square's 45-character limit, so **every** lesson card
 * charge was rejected — Pay ahead, Try again and the daily job alike (#99). The
 * mock server did not enforce the limit, so the suites stayed green.
 *
 * Hashing keeps the key stable per charge (the property that makes a retry
 * return the original payment rather than taking a second one) while fitting
 * with room to spare: `lc-` + 16 hex = 19 characters.
 */
export function lessonChargeIdempotencyKey(chargeId: string): string {
  return `lc-${fnv1a64Hex(chargeId)}`;
}

/**
 * The key to send to Square for a charge that already exists.
 *
 * Charges written before #99 stored an over-long key, and a retry that reuses
 * it fails exactly as the first attempt did. Anything Square would reject is
 * re-derived from the charge id, which is deterministic — so a retry of a
 * charge that somehow *did* reach Square still matches the original payment.
 */
export function squareIdempotencyKeyFor(
  charge: Pick<LessonScheduledCharge, 'id' | 'idempotencyKey'>
): string {
  const stored = charge.idempotencyKey;
  if (stored && stored.length <= MAX_SQUARE_IDEMPOTENCY_KEY_LENGTH) {
    return stored;
  }
  return lessonChargeIdempotencyKey(charge.id);
}

/**
 * What a not-yet-taken charge should become when one of its lessons is
 * cancelled.
 *
 * `cancel` when nothing is left to pay for, otherwise `release` with the
 * repriced amount. Pricing by the charge's own average rather than by
 * re-resolving the student's rate is deliberate: the charge already carries
 * the price the family agreed to, a flat-amount rule has no per-lesson price to
 * look up, and a rate change since planning must not silently reprice a block.
 *
 * Only ever applied to a `scheduled` charge. Once money has moved, a cancelled
 * lesson is a credit conversation, not an edit (studio policy: prepaid means
 * committed).
 */
export function releaseLessonFromCharge(
  charge: Pick<LessonScheduledCharge, 'lessonIds' | 'amountCents'>,
  lessonId: string
): { action: 'cancel' } | { action: 'release'; amountCents: number } {
  const remaining = charge.lessonIds.filter((id) => id !== lessonId);
  if (remaining.length === 0) return { action: 'cancel' };
  const perLesson = Math.round(charge.amountCents / charge.lessonIds.length);
  return {
    action: 'release',
    amountCents: Math.max(0, charge.amountCents - perLesson),
  };
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
 * Every status does: a scheduled or in-flight charge is about to take the
 * money, a paid one took it, `waived`/`cancelled` are a human saying the studio
 * is not charging for that teaching, and a `failed` one is money still owed on
 * a charge that already exists. Re-planning any of them would bill a family
 * for lessons that are already spoken for.
 *
 * `failed` used to be excluded, on the reasoning that those lessons are still
 * owed and a human retry is the recovery. Both halves of that are true, but
 * the exclusion meant the *lessons* looked unbilled, and two things followed
 * (#100, #102):
 *
 *  - the daily job re-planned the same block, hit the failed charge's
 *    deterministic id, and aborted the whole run for every student;
 *  - Pay ahead offered the same lessons again, so a second charge could overlap
 *    the failed one and a later retry of both would take payment twice.
 *
 * The recovery is unchanged and still deliberate: **Try again** on the failed
 * charge, which reuses its document and key. What changed is that the way out
 * is now only through that charge — waive or cancel it (both accept `failed`)
 * if the studio is not collecting after all.
 */
export const LESSON_CHARGE_COVERING_STATUSES: readonly LessonChargeStatus[] = [
  'scheduled',
  'charging',
  'paid',
  'waived',
  'cancelled',
  'failed',
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
