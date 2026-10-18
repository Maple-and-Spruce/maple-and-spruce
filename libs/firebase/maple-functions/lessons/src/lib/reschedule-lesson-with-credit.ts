/**
 * Reschedule Lesson With Credit (#209)
 *
 * Katie cancels a lesson and books its replacement in one step. Whatever paid
 * for the cancelled lesson — a card charge, or an invoice line — now pays for
 * the replacement instead.
 *
 * MOVING THE PAYMENT, NOT TRACKING A CREDIT
 * -----------------------------------------
 * There is no credit balance. The charge (or invoice line) that named the
 * cancelled lesson is rewritten to name the replacement, so every reader that
 * asks "is this lesson paid for?" — the Next lessons plan, pay-ahead, the
 * Activity tab, past-unpaid charging — already answers yes for it, and no for
 * the cancelled one, without knowing credits exist. If nothing had billed the
 * cancelled lesson yet, there is nothing to move and the replacement is billed
 * like any other lesson.
 *
 * Whether a family gets a credit is Katie's judgement under the studio policy;
 * nothing here enforces "one in four".
 *
 * RETRY-SAFE BY ORDER
 * -------------------
 * Three writes, no transaction spanning them, so each is idempotent and they
 * run in an order where stopping between any two leaves nothing wrong:
 *   1. book the replacement at a deterministic id (`creditLessonId`) — a retry
 *      finds it rather than booking a second one;
 *   2. move the payment — a no-op once nothing names the original;
 *   3. cancel the original.
 *
 * The original is cancelled **without** releasing it from a pending charge, as
 * `updateLesson` does: the charge no longer names it by then, and under the
 * policy that payment is exactly what covers the replacement.
 */
import {
  assertCanManageLesson,
  assertRoomIsFree,
  type FunctionContext,
  resolveLessonBlock,
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import {
  InvoiceRepository,
  LessonRepository,
  LessonScheduledChargeRepository,
} from '@maple/firebase/database';
import {
  chargeCoversItsLessons,
  creditLessonId,
  type Lesson,
  lessonRoom,
} from '@maple/ts/domain';
import { lessonValidation } from '@maple/ts/validation';
import type {
  CarriedLessonCoverage,
  RescheduleLessonWithCreditRequest,
  RescheduleLessonWithCreditResponse,
} from '@maple/ts/firebase/api-types';

export async function rescheduleLessonWithCredit(
  data: RescheduleLessonWithCreditRequest,
  context: FunctionContext,
): Promise<RescheduleLessonWithCreditResponse> {
  if (!data.lessonId) throwInvalidArgument('Which lesson is being cancelled?');

  const original = await LessonRepository.findById(data.lessonId);
  if (!original) throwNotFound('Lesson', data.lessonId);

  await assertCanManageLesson(context, original.teacherId);

  if (original.creditForLessonId) {
    // Not forbidden in principle, but a chain of credits is a sign of a
    // mis-click; moving the replacement covers every real case.
    throwInvalidArgument(
      'This lesson already replaces a cancelled one. Move it instead.',
    );
  }
  if (original.status === 'rendered' || original.status === 'no-show') {
    throwInvalidArgument('This lesson has already been marked as taught.');
  }

  const replacement =
    (await LessonRepository.findById(creditLessonId(original.id))) ??
    (await bookReplacement(original, data, context));

  const coverage = await movePayment(original, replacement.id);

  const cancelledFor = data.reason ?? original.cancelledFor ?? null;
  const cancelled =
    original.status === 'cancelled' &&
    (original.cancelledFor ?? null) === cancelledFor
      ? original
      : await LessonRepository.update({
          id: original.id,
          status: 'cancelled',
          cancelledFor,
        });

  return { cancelled, replacement, coverage };
}

async function bookReplacement(
  original: Lesson,
  data: RescheduleLessonWithCreditRequest,
  context: FunctionContext,
): Promise<Lesson> {
  const scheduledAt =
    data.scheduledAt instanceof Date
      ? data.scheduledAt
      : new Date(data.scheduledAt as unknown as string);
  const durationMinutes = data.durationMinutes ?? original.durationMinutes;
  const room = lessonRoom(data.room ?? original.room);

  const draft = {
    studentId: original.studentId,
    teacherId: original.teacherId,
    scheduledAt,
    durationMinutes,
    status: 'scheduled' as const,
  };
  const validation = lessonValidation(draft);
  if (!validation.isValid()) {
    const errors = Object.entries(validation.getErrors())
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throwInvalidArgument(`Validation failed: ${errors}`);
  }

  const blockId = await resolveLessonBlock({
    strategy: data.blockStrategy,
    blockId: original.blockId,
    teacherId: original.teacherId,
    scheduledAts: [scheduledAt],
    durationMinutes,
    recurring: false,
    context,
  });

  await assertRoomIsFree([{ room, scheduledAt, durationMinutes }]);

  const created = await LessonRepository.createWithId(
    creditLessonId(original.id),
    {
      ...draft,
      room,
      blockId,
      primaryTeacherAtCreateId: original.primaryTeacherAtCreateId,
      creditForLessonId: original.id,
    },
  );
  // A concurrent request booked it between our read and this write.
  return (
    created ??
    ((await LessonRepository.findById(creditLessonId(original.id))) as Lesson)
  );
}

/**
 * Point whatever billed `original` at `replacementId`, and say what that was.
 *
 * A charge or invoice already naming the replacement counts too, so a retry
 * that finds the payment already moved still reports it.
 */
async function movePayment(
  original: Lesson,
  replacementId: string,
): Promise<CarriedLessonCoverage> {
  const [charges, invoices] = await Promise.all([
    LessonScheduledChargeRepository.findAll({ studentId: original.studentId }),
    InvoiceRepository.findAll({ studentId: original.studentId }),
  ]);
  const names = (ids: Array<string | undefined>) =>
    ids.includes(original.id) || ids.includes(replacementId);

  const coveringCharges = charges.filter(
    (charge) => chargeCoversItsLessons(charge) && names(charge.lessonIds),
  );
  for (const charge of coveringCharges) {
    if (!charge.lessonIds.includes(original.id)) continue;
    await LessonScheduledChargeRepository.moveCoveredLesson(
      charge.id,
      original.id,
      replacementId,
    );
  }

  const coveringInvoices = invoices.filter(
    (invoice) =>
      invoice.status !== 'void' &&
      names(invoice.lineItems.map((line) => line.lessonId)),
  );
  for (const invoice of coveringInvoices) {
    if (!invoice.lineItems.some((line) => line.lessonId === original.id)) continue;
    await InvoiceRepository.moveLineLesson(invoice.id, original.id, replacementId);
  }

  // A charge outranks an invoice, as in `lessonBillingState`: the card charge
  // is where the money actually moved.
  if (coveringCharges.length > 0) return 'charge';
  if (coveringInvoices.length > 0) return 'invoice';
  return 'none';
}
