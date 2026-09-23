/**
 * chargeLessonsNow (legacy #864) — take money for a block of lessons on the spot.
 *
 * Some families agree to pay for several lessons up front, in exchange for the
 * slot being a mutual commitment. That is a conversation at the desk, so the
 * charge has to happen at the desk too, not on a due date next week.
 *
 * It produces the **same** `LessonScheduledCharge` an automatic charge would,
 * already `paid`, so the charges screen, teacher payouts and the next planning
 * run all keep working without knowing which way the money was taken. Epic #51
 * decided lesson money has one ledger; this does not add a second.
 *
 * Lives in this library rather than a new one: same domain, same secrets, same
 * Square dependency, and ADR-029 counts every library as another Cloud Run
 * service. The library keeps exporting `runLessonBilling`, which is what CI
 * derives the deploy filter from.
 */
import { Functions, Role } from '@maple/firebase/functions';
import { throwInvalidArgument, throwNotFound } from '@maple/firebase/functions';
import { Square, SQUARE_SECRET_NAMES, SQUARE_STRING_NAMES } from '@maple/firebase/square';
import {
  InvoiceRepository,
  LessonRatesConfigRepository,
  LessonRepository,
  LessonScheduledChargeRepository,
  StudentRepository,
} from '@maple/firebase/database';
import {
  MANUAL_CHARGE_RULE_ID,
  describePrepaymentProblem,
  invoicedLessonIds,
  resolvePrivatePayLessonRateCents,
} from '@maple/ts/domain';
import type {
  ChargeLessonsNowRequest,
  ChargeLessonsNowResponse,
} from '@maple/ts/firebase/api-types';
import { chargeLessonsNowLogic } from './charge-lessons-now.logic';
import type { ChargeNowRefusal } from './charge-lessons-now.logic';

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Square's own words for a decline, or an honest "this is on us" otherwise.
 *
 * Square answers a malformed request and a refused card through the same
 * channel, and calling both a decline points the admin at the family's card
 * when the problem is ours (#99). A real decline carries a payment-method
 * error; anything else is a request we got wrong.
 */
function describePaymentFailure(message: string): string {
  const looksLikeDecline =
    /declin|insufficient|cvv|expir|card_not_supported|card error|PAYMENT_METHOD_ERROR|GENERIC_DECLINE/i.test(
      message
    );
  return looksLikeDecline
    ? `The card was declined: ${message}`
    : `The payment could not be sent to Square: ${message}. Nothing was charged — this one is on us, not the card.`;
}

/** Turn a refusal into the sentence the admin sees, and never a stack trace. */
function refusalMessage(refusal: ChargeNowRefusal): string {
  switch (refusal.kind) {
    case 'plan':
      return describePrepaymentProblem(refusal.problem);
    case 'not-chargeable':
      return 'This student is not billed here. Hope Scholarship students are invoiced through the EMA portal, and inactive students are not charged.';
    case 'no-card':
      return 'There is no card on file for this student. Save the card in the Square app, then link it before charging.';
    case 'amount-changed':
      return `Those lessons now come to ${money(refusal.actualCents)}, not the amount shown. Reload and check before charging.`;
    case 'already-claimed':
      return 'That charge is already being taken. Reload to see where it got to.';
    case 'not-retryable':
      return 'That charge is not in a failed state, so there is nothing to retry.';
  }
}

export const chargeLessonsNow = Functions.endpoint
  .requiringRole(Role.Admin)
  .usingSecrets(...SQUARE_SECRET_NAMES)
  .usingStrings(...SQUARE_STRING_NAMES)
  .handle<ChargeLessonsNowRequest, ChargeLessonsNowResponse>(
    async (data, context, secrets, strings) => {
      if (!data?.studentId) throwInvalidArgument('A student is required');

      const uid = context?.uid;
      if (!uid) throwInvalidArgument('Sign in again before charging');

      const [student, lessons, existingCharges, rates, invoices] =
        await Promise.all([
          StudentRepository.findById(data.studentId),
          LessonRepository.findAll({ studentId: data.studentId }),
          LessonScheduledChargeRepository.findAll({
            studentId: data.studentId,
          }),
          LessonRatesConfigRepository.get(),
          // A lesson already on a live invoice must not also be charged to the
          // card — the two halves of "billed" have to see each other (#101).
          InvoiceRepository.findAll({ studentId: data.studentId }),
        ]);

      if (!student) throwNotFound('Student', data.studentId);

      const square = new Square(secrets, strings);

      const outcome = await chargeLessonsNowLogic(
        {
          student,
          lessons,
          existingCharges,
          alreadyInvoiced: invoicedLessonIds(invoices),
          lessonIds: data.lessonIds,
          lessonCount: data.lessonCount,
          expectedAmountCents: data.expectedAmountCents,
          note: data.note,
          retryChargeId: data.retryChargeId,
          uid,
        },
        {
          claimByCreate: async (charge) => {
            const created = await LessonScheduledChargeRepository.createIfAbsent(
              {
                ...charge,
                ruleId: MANUAL_CHARGE_RULE_ID,
                source: 'manual',
                // Created already `charging`: the atomic create IS the lease,
                // so the document exists before the money moves and a second
                // click loses the race instead of taking a second payment.
                status: 'charging',
              }
            );
            return created !== null;
          },
          claimRetry: (id) => LessonScheduledChargeRepository.tryClaimRetry(id),
          findCharge: (id) => LessonScheduledChargeRepository.findById(id),
          markPaid: (id, paymentId) =>
            LessonScheduledChargeRepository.markPaid(id, paymentId),
          markFailed: (id, error) =>
            LessonScheduledChargeRepository.markFailed(id, error),
          charge: async ({ customerId, cardId, amountCents, idempotencyKey, note }) => {
            const payment = await square.paymentsService.createPayment({
              sourceId: cardId,
              customerId,
              amountCents,
              idempotencyKey,
              locationId: square.locationId,
              note,
            });
            return payment.paymentId;
          },
        },
        (lesson) =>
          resolvePrivatePayLessonRateCents(lesson, student, rates.rateByLength),
        new Date()
      );

      if (!outcome.ok) {
        // A declined card is not a bug in the request, and the charge document
        // already records why. Surfacing the reason verbatim is what lets Katie
        // tell a family "your card was declined" instead of "it didn't work".
        //
        // Only when it really was a decline, though. Square's rejection of an
        // over-long idempotency key came back as "The card was declined: Field
        // must not be greater than 45 length", which sent everyone looking at
        // the family's card instead of at our request (#99).
        throwInvalidArgument(
          'message' in outcome.refusal
            ? describePaymentFailure(outcome.refusal.message)
            : refusalMessage(outcome.refusal)
        );
      }

      const charge = await LessonScheduledChargeRepository.findById(
        outcome.chargeId
      );
      if (!charge) throwNotFound('Charge', outcome.chargeId);

      console.log(
        `[charge-lessons-now] ${money(outcome.amountCents)} taken for student ` +
          `${student.id} (charge ${outcome.chargeId}, payment ${outcome.squarePaymentId})`
      );

      return { charge };
    }
  );
