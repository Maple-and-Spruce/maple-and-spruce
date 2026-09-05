/**
 * runLessonBilling — plan lesson charges, then take the ones that are due (#798).
 *
 * Katie and Nathan were already vaulting a family's card in Square and charging
 * by hand every month. This does that on a schedule, from a rule they set once.
 *
 * The decision logic lives in `./run-lesson-billing.logic`, deliberately free of
 * Firestore and Square so the parts that move money can be tested directly. This
 * file is the wiring: repositories in, a Square client in, counters out.
 *
 * Uses the **Maple & Spruce** Square account, not Music Together's — lessons are
 * M&S revenue, and MT settles to a different business (#791).
 *
 * Deployed to us-east4 via CI/CD (maple-square codebase — it needs the Square
 * SDK, so it belongs with the other Square work rather than in maple-core).
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { Functions, Role } from '@maple/firebase/functions';
import {
  Square,
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
} from '@maple/firebase/square';
import {
  LessonBillingRuleRepository,
  LessonRatesConfigRepository,
  LessonRepository,
  LessonScheduledChargeRepository,
  StudentRepository,
} from '@maple/firebase/database';
import type { Lesson } from '@maple/ts/domain';
import type {
  RunLessonBillingRequest,
  RunLessonBillingResult,
} from '@maple/ts/firebase/api-types';
import { chargeDue, planCharges } from './run-lesson-billing.logic';

const TIMEZONE = 'America/New_York';

const squareSecretParams = SQUARE_SECRET_NAMES.map((name) => defineSecret(name));
const squareStringParams = SQUARE_STRING_NAMES.map((name) => defineString(name));

/**
 * Core run. Plans first, then charges — so a charge planned by this very run
 * whose due date has already passed (a backdated block, say) is taken in the
 * same pass rather than waiting a week.
 */
export async function runLessonBilling(
  now: Date,
  square: Square,
  opts: { dryRun?: boolean } = {}
): Promise<RunLessonBillingResult> {
  const dryRun = opts.dryRun === true;

  const [students, rules, defaultRule, ratesConfig, allLessons] =
    await Promise.all([
      StudentRepository.findAll(),
      LessonBillingRuleRepository.findAll(),
      LessonBillingRuleRepository.findDefault(),
      LessonRatesConfigRepository.get(),
      LessonRepository.findAll(),
    ]);

  const lessonsByStudent = new Map<string, Lesson[]>();
  for (const lesson of allLessons) {
    const bucket = lessonsByStudent.get(lesson.studentId) ?? [];
    bucket.push(lesson);
    lessonsByStudent.set(lesson.studentId, bucket);
  }

  const plan = await planCharges(students, {
    rules,
    defaultRule,
    rateByLength: ratesConfig.rateByLength,
    lessonsByStudent,
    // A dry run must not create charge documents either — a "planned" charge is
    // a promise to take money, not a preview.
    createIfAbsent: dryRun
      ? async () => ({ id: 'dry-run' })
      : (input) => LessonScheduledChargeRepository.createIfAbsent(input),
  });

  // Only `scheduled` charges can be taken; everything else is terminal or
  // already in flight, and `chargeDue` re-checks the status anyway.
  const charges = await LessonScheduledChargeRepository.findAll({
    status: 'scheduled',
  });

  const studentById = new Map(students.map((s) => [s.id, s]));

  const taken = await chargeDue(
    charges,
    {
      claimLease: (id) => LessonScheduledChargeRepository.tryClaimLease(id),
      markPaid: (id, paymentId) =>
        LessonScheduledChargeRepository.markPaid(id, paymentId),
      markFailed: (id, error) =>
        LessonScheduledChargeRepository.markFailed(id, error),
      charge: async ({ customerId, cardId, amountCents, idempotencyKey }) => {
        const payment = await square.paymentsService.createPayment({
          sourceId: cardId,
          customerId,
          amountCents,
          idempotencyKey,
          locationId: square.locationId,
          note: 'Music lessons',
        });
        return payment.paymentId;
      },
      studentById,
      dryRun,
    },
    now
  );

  const result: RunLessonBillingResult = {
    studentsConsidered: plan.considered,
    chargesPlanned: plan.planned,
    chargesAlreadyPlanned: plan.alreadyPlanned,
    skippedNoRate: plan.skippedNoRate,
    charged: taken.charged,
    chargeFailed: taken.failed,
    skippedNoCard: taken.skippedNoCard,
    dryRun,
  };

  console.log(
    `[lesson-billing]${dryRun ? ' DRY RUN' : ''} ` +
      `${result.studentsConsidered} student(s): planned ${result.chargesPlanned}, ` +
      `already planned ${result.chargesAlreadyPlanned}, charged ${result.charged}, ` +
      `failed ${result.chargeFailed}, no card ${result.skippedNoCard}, ` +
      `no rate ${result.skippedNoRate}`
  );

  return result;
}

function buildSquare(): Square {
  const secrets = Object.fromEntries(
    squareSecretParams.map((s) => [s.name, s.value()])
  );
  const strings = Object.fromEntries(
    squareStringParams.map((s) => [s.name, s.value()])
  );
  return new Square(secrets, strings);
}

/**
 * Daily at 09:00 ET. Daily rather than weekly because a charge anchored "the
 * day before the first lesson" has to land on that day, not on whichever day
 * the job happens to run.
 */
export const runLessonBillingScheduled = onSchedule(
  {
    schedule: '0 9 * * *',
    timeZone: TIMEZONE,
    region: 'us-east4',
    secrets: squareSecretParams,
  },
  async () => {
    await runLessonBilling(new Date(), buildSquare());
  }
);

/**
 * Admin-callable twin — manual catch-up, a dry run, and the way integration
 * tests reach this at all (`onSchedule` is not callable over HTTP in the
 * emulator).
 */
export const triggerLessonBilling = Functions.endpoint
  .requiringRole(Role.Admin)
  .usingSecrets(...SQUARE_SECRET_NAMES)
  .usingStrings(...SQUARE_STRING_NAMES)
  .handle<RunLessonBillingRequest, RunLessonBillingResult>(
    async (data, _context, secrets, strings) => {
      const square = new Square(secrets, strings);
      return runLessonBilling(new Date(), square, {
        dryRun: data?.dryRun === true,
      });
    }
  );
