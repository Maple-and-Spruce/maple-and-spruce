/**
 * Lesson billing: plan, then charge (#798).
 *
 * Kept separate from the trigger wiring so both triggers and the tests share
 * exactly one implementation, and so the parts that decide money can be tested
 * without a Square client or an emulator.
 *
 * ONE JOB, TWO PHASES
 * -------------------
 * Planning and charging are one scheduled run rather than two functions,
 * because both are derived from the same thing — the student's lessons — and
 * splitting them would double the deploy surface (ADR-029) to buy nothing. The
 * phases stay separable in code, and the callable twin can do either.
 *
 * OVERCHARGE SAFETY, THREE LAYERS (unchanged from the MT installment path)
 * -----------------------------------------------------------------------
 *   1. The **deterministic charge id** (`plannedChargeId`, keyed on the first
 *      lesson covered) means re-planning finds the charge already there.
 *   2. The **Firestore lease** flips `scheduled → charging` in a transaction,
 *      so two overlapping runs cannot both take one charge.
 *   3. The **stable Square idempotency key** derived from that id means a retry
 *      returns the original payment rather than taking a second one.
 *
 * Failures are loud and terminal: the charge goes `failed` and waits for a
 * human. Nothing here retries a payment on its own.
 */
import {
  isAutoChargeEligible,
  isLessonChargeDue,
  planChargesForStudent,
  plannedChargeId,
  resolvePrivatePayLessonRateCents,
} from '@maple/ts/domain';
import type {
  Lesson,
  LessonBillingRule,
  LessonRateByLength,
  LessonScheduledCharge,
  Student,
} from '@maple/ts/domain';

export interface LessonBillingResult {
  studentsConsidered: number;
  chargesPlanned: number;
  chargesAlreadyPlanned: number;
  charged: number;
  chargeFailed: number;
  /** Due charges skipped because the family has no card on file. */
  skippedNoCard: number;
  /** Blocks skipped because no rate resolved for the student. */
  skippedNoRate: number;
  /** True when nothing was actually charged. */
  dryRun: boolean;
}

export interface PlanDeps {
  rules: LessonBillingRule[];
  defaultRule?: LessonBillingRule;
  rateByLength: LessonRateByLength;
  lessonsByStudent: Map<string, Lesson[]>;
  createIfAbsent: (input: {
    id: string;
    studentId: string;
    ruleId: string;
    lessonIds: string[];
    amountCents: number;
    dueAt: Date;
  }) => Promise<unknown | null>;
}

/**
 * Which rule a student is billed on: their own, else the studio default.
 *
 * A student pointing at a rule that has since been deleted falls back to the
 * default rather than silently not being billed — an unbilled student is
 * invisible, and invisible is how revenue goes missing.
 */
export function ruleForStudent(
  student: Pick<Student, 'billingRuleId'>,
  rules: LessonBillingRule[],
  defaultRule?: LessonBillingRule
): LessonBillingRule | undefined {
  if (student.billingRuleId) {
    const own = rules.find((r) => r.id === student.billingRuleId);
    if (own) return own;
  }
  return defaultRule;
}

/** Phase one: turn each eligible student's lessons into planned charges. */
export async function planCharges(
  students: Student[],
  deps: PlanDeps
): Promise<{
  planned: number;
  alreadyPlanned: number;
  considered: number;
  /** Students with lessons to bill but no rate that resolves. */
  skippedNoRate: number;
}> {
  let planned = 0;
  let alreadyPlanned = 0;
  let considered = 0;
  let skippedNoRate = 0;

  for (const student of students) {
    // Hope students are never charged — they bill through EMA (#799).
    if (!isAutoChargeEligible(student)) continue;

    const rule = ruleForStudent(student, deps.rules, deps.defaultRule);
    if (!rule || rule.archived) continue;

    considered++;

    const lessons = deps.lessonsByStudent.get(student.id) ?? [];
    const charges = planChargesForStudent(student.id, rule, lessons, (lesson) =>
      resolvePrivatePayLessonRateCents(lesson, student, deps.rateByLength)
    );

    for (const charge of charges) {
      // A charge that prices at nothing means no rate resolved for this
      // student — no per-student override, and nothing in the rates config for
      // their lesson length. Taking $0 would look like a successful bill, so
      // it is skipped and COUNTED: an unbilled student is otherwise invisible,
      // and invisible is how revenue goes missing.
      if (charge.amountCents <= 0) {
        skippedNoRate++;
        continue;
      }

      const created = await deps.createIfAbsent({
        id: plannedChargeId(charge),
        studentId: charge.studentId,
        ruleId: charge.ruleId,
        lessonIds: charge.lessonIds,
        amountCents: charge.amountCents,
        dueAt: charge.dueAt,
      });

      if (created) planned++;
      else alreadyPlanned++;
    }
  }

  return { planned, alreadyPlanned, considered, skippedNoRate };
}

export interface ChargeDeps {
  claimLease: (id: string) => Promise<boolean>;
  markPaid: (id: string, squarePaymentId: string) => Promise<void>;
  markFailed: (id: string, error: string) => Promise<void>;
  /** Take the money. Returns the Square payment id. */
  charge: (input: {
    customerId: string;
    cardId: string;
    amountCents: number;
    idempotencyKey: string;
  }) => Promise<string>;
  studentById: Map<string, Student>;
  dryRun: boolean;
}

/** Phase two: take every charge that is due. */
export async function chargeDue(
  charges: LessonScheduledCharge[],
  deps: ChargeDeps,
  now: Date
): Promise<{ charged: number; failed: number; skippedNoCard: number }> {
  let charged = 0;
  let failed = 0;
  let skippedNoCard = 0;

  for (const charge of charges) {
    if (!isLessonChargeDue(charge, now)) continue;

    const student = deps.studentById.get(charge.studentId);
    // A student who has left, or become a Hope student since the charge was
    // planned, is not charged. Re-checked here rather than trusted from
    // planning time, because the two can be weeks apart.
    if (!student || !isAutoChargeEligible(student)) continue;

    if (!student.squareCustomerId || !student.squareCardId) {
      skippedNoCard++;
      continue;
    }

    if (deps.dryRun) {
      charged++;
      continue;
    }

    // Claim AFTER every reason to skip has been checked. Doing it this way
    // round means a claimed charge is always either paid or failed — there is
    // no path that claims a lease and then walks away, leaving it stuck in
    // `charging` where nothing would ever move it again.
    const won = await deps.claimLease(charge.id);
    if (!won) continue;

    try {
      const paymentId = await deps.charge({
        customerId: student.squareCustomerId,
        cardId: student.squareCardId,
        amountCents: charge.amountCents,
        idempotencyKey: charge.idempotencyKey,
      });
      await deps.markPaid(charge.id, paymentId);
      charged++;
    } catch (error) {
      await deps.markFailed(
        charge.id,
        error instanceof Error ? error.message : String(error)
      );
      failed++;
    }
  }

  return { charged, failed, skippedNoCard };
}
