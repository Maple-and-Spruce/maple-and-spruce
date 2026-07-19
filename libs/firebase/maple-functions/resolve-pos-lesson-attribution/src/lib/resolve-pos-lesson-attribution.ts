/**
 * Resolve POS Lesson Attribution Cloud Function (#628)
 *
 * Resolves a pending in-person POS lesson sale from the review queue:
 *  - `attribute` — tie it to a student: settle their matching open invoice or
 *    create a paid one (`square-pos`), then mark the attribution attributed.
 *  - `dismiss`   — not a lesson / refunded — mark it dismissed.
 *
 * Mirrors resolveSyncConflict's action switch. Admin-gated; the caller uid is
 * stamped as the resolver.
 */
import {
  createAdminFunction,
  throwFailedPrecondition,
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import {
  InvoiceRepository,
  PosLessonAttributionRepository,
  StudentRepository,
} from '@maple/firebase/database';
import type {
  ResolvePosLessonAttributionRequest,
  ResolvePosLessonAttributionResponse,
} from '@maple/ts/firebase/api-types';

export const resolvePosLessonAttribution = createAdminFunction<
  ResolvePosLessonAttributionRequest,
  ResolvePosLessonAttributionResponse
>(async (data, context) => {
  if (!data.attributionId) {
    throwInvalidArgument('attributionId is required');
  }

  const existing = await PosLessonAttributionRepository.findById(
    data.attributionId
  );
  if (!existing) {
    throwNotFound('POS lesson attribution', data.attributionId);
  }
  if (existing.status !== 'pending') {
    throwFailedPrecondition(
      `This POS lesson sale is already ${existing.status}.`
    );
  }

  const resolvedBy = context.uid ?? 'unknown';

  if (data.action === 'dismiss') {
    const attribution = await PosLessonAttributionRepository.dismiss({
      id: existing.id,
      dismissedBy: resolvedBy,
      notes: data.notes,
    });
    return { attribution };
  }

  if (data.action !== 'attribute') {
    throwInvalidArgument(`Unknown action: ${data.action}`);
  }
  if (!data.studentId) {
    throwInvalidArgument('studentId is required to attribute the sale');
  }

  const student = await StudentRepository.findById(data.studentId);
  if (!student) {
    throwNotFound('Student', data.studentId);
  }

  const { invoice } = await InvoiceRepository.settleOrCreatePosLessonInvoice({
    studentId: data.studentId,
    subtotalCents: existing.subtotalCents,
    description: `In-person lesson — ${existing.itemName}`,
    squarePaymentId: existing.squarePaymentId,
    squareOrderId: existing.squareOrderId,
    recordedByUid: resolvedBy,
  });

  const attribution = await PosLessonAttributionRepository.attribute({
    id: existing.id,
    studentId: data.studentId,
    invoiceId: invoice.id,
    attributedBy: resolvedBy,
  });

  return { attribution };
});
