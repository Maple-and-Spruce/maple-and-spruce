/**
 * Taking a prepayment, in order (legacy #864).
 *
 * Separated from the wiring for the same reason the scheduled job is: the part
 * that decides whether money moves should be testable without a Square client
 * or an emulator.
 *
 * THE ORDER IS THE SAFETY
 * -----------------------
 * The lease is claimed by **creating the charge document** before the payment
 * is taken, not after. Firestore's `create` fails if the id is taken, so two
 * clicks on the same button race for one document and exactly one wins. Doing
 * it the other way round — charge, then record — leaves a window where a
 * double click takes the money twice and only the second write notices.
 *
 * After the claim there is no path that walks away: the charge ends `paid` or
 * `failed`, never stranded in `charging` where nothing would move it again.
 */
import {
  MANUAL_CHARGE_RULE_ID,
  isAutoChargeEligible,
  lessonChargeIdempotencyKey,
  planPrepayment,
} from '@maple/ts/domain';
import type {
  Lesson,
  LessonScheduledCharge,
  PrepaymentProblem,
  Student,
} from '@maple/ts/domain';

/** Why a prepayment could not be taken, in a form the callable can map to an error. */
export type ChargeNowRefusal =
  | { kind: 'plan'; problem: PrepaymentProblem }
  /** Hope, or no longer active. */
  | { kind: 'not-chargeable' }
  | { kind: 'no-card' }
  /** The total moved between the admin seeing it and clicking. */
  | { kind: 'amount-changed'; actualCents: number }
  /** Another click, or the billing job, got there first. */
  | { kind: 'already-claimed' }
  /** A retry was asked for against a charge that is not failed. */
  | { kind: 'not-retryable' };

export interface ChargeNowDeps {
  /**
   * Claim by creating the charge at its deterministic id, already `charging`.
   * Returns false when the id is taken — the atomic create IS the lease.
   */
  claimByCreate: (charge: {
    id: string;
    studentId: string;
    lessonIds: string[];
    amountCents: number;
    dueAt: Date;
    note?: string;
    chargedByUid: string;
  }) => Promise<boolean>;
  /** Re-claim a failed charge for a retry: `failed → charging`. */
  claimRetry: (id: string) => Promise<boolean>;
  findCharge: (id: string) => Promise<LessonScheduledCharge | undefined>;
  markPaid: (id: string, squarePaymentId: string) => Promise<void>;
  markFailed: (id: string, error: string) => Promise<void>;
  charge: (input: {
    customerId: string;
    cardId: string;
    amountCents: number;
    idempotencyKey: string;
    note: string;
  }) => Promise<string>;
}

export type ChargeNowOutcome =
  | { ok: true; chargeId: string; squarePaymentId: string; amountCents: number }
  | { ok: false; refusal: ChargeNowRefusal }
  | { ok: false; refusal: { kind: 'payment-failed'; message: string }; chargeId: string };

/** What Square shows on the family's statement. */
function squareNote(lessonCount: number, note?: string): string {
  const base = `${lessonCount} music lesson${lessonCount === 1 ? '' : 's'}`;
  return note ? `${base} — ${note}` : base;
}

/**
 * Charge a student for a block of lessons now.
 *
 * `retryChargeId` re-runs an existing failed charge instead of planning a new
 * one. Its lessons, amount and idempotency key all come from the stored
 * document — a retry must not quietly become a different charge.
 */
export async function chargeLessonsNowLogic(
  input: {
    student: Student;
    lessons: Lesson[];
    existingCharges: LessonScheduledCharge[];
    lessonIds?: string[];
    lessonCount?: number;
    expectedAmountCents?: number;
    note?: string;
    retryChargeId?: string;
    uid: string;
  },
  deps: ChargeNowDeps,
  rateResolver: (lesson: Pick<Lesson, 'durationMinutes'>) => number,
  now: Date
): Promise<ChargeNowOutcome> {
  const { student } = input;

  // Re-checked here rather than trusted from the screen: a student can have
  // become a Hope student, or left, since the page was loaded. Hope families
  // bill through the EMA portal and must never be charged here (legacy #799).
  if (!isAutoChargeEligible(student)) {
    return { ok: false, refusal: { kind: 'not-chargeable' } };
  }
  if (!student.squareCustomerId || !student.squareCardId) {
    return { ok: false, refusal: { kind: 'no-card' } };
  }

  let chargeId: string;
  let amountCents: number;
  let lessonCount: number;
  let idempotencyKey: string;

  if (input.retryChargeId) {
    const existing = await deps.findCharge(input.retryChargeId);
    if (!existing || existing.status !== 'failed') {
      return { ok: false, refusal: { kind: 'not-retryable' } };
    }
    chargeId = existing.id;
    amountCents = existing.amountCents;
    lessonCount = existing.lessonIds.length;
    // The stored key, not a fresh one. If the first attempt did reach Square,
    // this returns that payment rather than taking a second.
    idempotencyKey = existing.idempotencyKey;

    if (!(await deps.claimRetry(chargeId))) {
      return { ok: false, refusal: { kind: 'already-claimed' } };
    }
  } else {
    const outcome = planPrepayment(
      student.id,
      input.lessons,
      input.existingCharges,
      { lessonIds: input.lessonIds, lessonCount: input.lessonCount },
      rateResolver,
      now
    );
    if (!outcome.ok) {
      return { ok: false, refusal: { kind: 'plan', problem: outcome.problem } };
    }

    // The amount the admin agreed to with the family at the desk. If the
    // server prices it differently, stop — do not charge a number nobody said
    // out loud.
    if (
      typeof input.expectedAmountCents === 'number' &&
      input.expectedAmountCents !== outcome.plan.amountCents
    ) {
      return {
        ok: false,
        refusal: {
          kind: 'amount-changed',
          actualCents: outcome.plan.amountCents,
        },
      };
    }

    chargeId = outcome.plan.chargeId;
    amountCents = outcome.plan.amountCents;
    lessonCount = outcome.plan.lessons.length;
    idempotencyKey = lessonChargeIdempotencyKey(chargeId);

    const claimed = await deps.claimByCreate({
      id: chargeId,
      studentId: student.id,
      lessonIds: outcome.plan.lessons.map((l) => l.id),
      amountCents,
      // Taken now, so it is due now. Keeping `dueAt` honest matters because it
      // is what the charges screen sorts and groups by.
      dueAt: now,
      note: input.note,
      chargedByUid: input.uid,
    });
    if (!claimed) {
      return { ok: false, refusal: { kind: 'already-claimed' } };
    }
  }

  try {
    const squarePaymentId = await deps.charge({
      customerId: student.squareCustomerId,
      cardId: student.squareCardId,
      amountCents,
      idempotencyKey,
      note: squareNote(lessonCount, input.note),
    });
    await deps.markPaid(chargeId, squarePaymentId);
    return { ok: true, chargeId, squarePaymentId, amountCents };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await deps.markFailed(chargeId, message);
    return {
      ok: false,
      refusal: { kind: 'payment-failed', message },
      chargeId,
    };
  }
}

/** The sentinel rule id every manual charge carries. Re-exported for the wiring. */
export { MANUAL_CHARGE_RULE_ID };
