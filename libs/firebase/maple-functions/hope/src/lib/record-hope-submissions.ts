/**
 * recordHopeSubmissions Cloud Function (legacy #799)
 *
 * Records what has been claimed from the EMA portal for a batch of rendered
 * Hope lessons — Katie submits a term's worth at once, so this is bulk by
 * default rather than one call per lesson.
 *
 * THE GUARD IS HERE, NOT IN THE UI
 * --------------------------------
 * Hope pays only for services rendered. Every lesson is re-checked server-side
 * against `isSubmittableToHope` and against the student actually being a Hope
 * student, so a no-show (legacy #796) cannot be claimed even if a client asks for it.
 * A refused lesson is *skipped and reported*, not thrown — one bad id in a
 * batch of forty must not lose the other thirty-nine.
 *
 * The rate is stamped at record time. A later rate change must not retroactively
 * restate what EMA was actually told. It comes only from data Katie edits: the
 * EMA order the lesson is invoiced against, else the rate already on the claim,
 * else the student's EMA product. A lesson none of those prices is skipped,
 * never stamped with a guess (#83).
 */
import {
  type FunctionContext,
  throwInvalidArgument,
} from '@maple/firebase/functions';
import {
  HopeOrderRepository,
  HopeProductRepository,
  HopeSubmissionRepository,
  LessonRepository,
  StudentRepository,
} from '@maple/firebase/database';
import {
  HOPE_SUBMISSION_STATUSES,
  allocateHopeLessons,
  isSubmittableToHope,
  resolveHopeLessonRate,
} from '@maple/ts/domain';
import type { HopeAllocation, HopeOrder, HopeProduct } from '@maple/ts/domain';
import type {
  RecordHopeSubmissionsRequest,
  RecordHopeSubmissionsResponse,
} from '@maple/ts/firebase/api-types';

/** Why a lesson that failed `isSubmittableToHope` cannot be claimed. */
function whyNotSubmittable(status: string): string {
  switch (status) {
    case 'no-show':
      return 'Hope pays only for services rendered, and this lesson was a no-show';
    case 'cancelled':
      return 'Hope can only be billed for a lesson that happened, and this one was cancelled';
    default:
      return 'Hope can only be billed for a lesson that has happened, and this one is still to come';
  }
}

export async function recordHopeSubmissions(
  data: RecordHopeSubmissionsRequest,
  context: FunctionContext,
): Promise<RecordHopeSubmissionsResponse> {
  const lessonIds = data?.lessonIds ?? [];
  // Read once, and only if a claim actually needs stamping.
  let products: Map<string, HopeProduct> | undefined;
  const productsById = async () => {
    products ??= new Map(
      (await HopeProductRepository.findAll()).map((p) => [p.id, p]),
    );
    return products;
  };
  if (lessonIds.length === 0) {
    throwInvalidArgument('At least one lesson is required');
  }
  if (!HOPE_SUBMISSION_STATUSES.includes(data.status)) {
    throwInvalidArgument(`Unknown Hope submission status: ${data.status}`);
  }

  const now = new Date();

  // Invoicing ('submitted') is against an EMA order: work out, once per
  // student, which of their taught lessons an order has room for.
  const allocations = new Map<
    string,
    { allocation: HopeAllocation; orders: HopeOrder[] }
  >();
  const allocationFor = async (studentId: string) => {
    const cached = allocations.get(studentId);
    if (cached) return cached;
    const [lessons, orders] = await Promise.all([
      // All of them: whether a lesson happened is decided below, not by its
      // status alone (#157).
      LessonRepository.findAll({ studentId }),
      HopeOrderRepository.findAll({ studentId }),
    ]);
    const taught = lessons.filter((l) => isSubmittableToHope(l, now));
    const claims = await HopeSubmissionRepository.findByLessonIds(
      taught.map((l) => l.id),
    );
    const allocation = allocateHopeLessons(
      taught.map((l) => ({
        lessonId: l.id,
        scheduledAt: l.scheduledAt,
        submission: claims.get(l.id),
      })),
      orders,
    );
    const result = { allocation, orders };
    allocations.set(studentId, result);
    return result;
  };

  const recordedLessonIds: string[] = [];
  const skipped: Array<{ lessonId: string; reason: string }> = [];

  for (const lessonId of lessonIds) {
    const lesson = await LessonRepository.findById(lessonId);
    if (!lesson) {
      skipped.push({ lessonId, reason: 'Lesson not found' });
      continue;
    }

    if (!isSubmittableToHope(lesson, now)) {
      // The important one. Hope funds cannot be retained for services not
      // rendered, so a no-show, a cancellation or a lesson still to come
      // can never be claimed.
      skipped.push({ lessonId, reason: whyNotSubmittable(lesson.status) });
      continue;
    }

    const student = await StudentRepository.findById(lesson.studentId);
    if (!student) {
      skipped.push({ lessonId, reason: 'Student not found' });
      continue;
    }
    if (!student.isHopeScholarship) {
      skipped.push({
        lessonId,
        reason: 'Student is not on the Hope Scholarship',
      });
      continue;
    }

    const existing = await HopeSubmissionRepository.findById(lessonId);

    // Invoicing needs an order with room. A lesson already invoiced keeps
    // the order it was invoiced against; one that no order covers is
    // refused, because the portal has nothing to invoice it against.
    let orderId = existing?.orderId;
    let orderPriceCents: number | undefined;
    if (data.status === 'submitted') {
      const { allocation, orders } = await allocationFor(student.id);
      const state = allocation.states.get(lessonId);
      if (state?.kind === 'needs-order') {
        skipped.push({
          lessonId,
          reason:
            'No EMA order has room for this lesson. Record the family’s order first.',
        });
        continue;
      }
      if (state?.kind === 'ready-to-invoice') {
        orderId = state.orderId;
        orderPriceCents = orders.find(
          (o) => o.id === state.orderId,
        )?.priceCents;
      }
    }

    // Keep the rate the claim was originally made at; only stamp a new
    // one when there was nothing claimed before.
    const rateCents =
      orderPriceCents ??
      existing?.rateCents ??
      resolveHopeLessonRate(student, await productsById()).rateCents;
    if (rateCents === undefined) {
      skipped.push({
        lessonId,
        reason:
          'This lesson has no price. Put the student on an EMA product first.',
      });
      continue;
    }

    await HopeSubmissionRepository.record({
      lessonId,
      studentId: lesson.studentId,
      teacherId: lesson.teacherId,
      lessonDate: lesson.scheduledAt,
      status: data.status,
      rateCents,
      orderId,
      submittedAt: existing?.submittedAt ?? now,
      paidAt: data.status === 'paid' ? now : existing?.paidAt,
      emaReference: data.emaReference ?? existing?.emaReference,
      rejectionReason:
        data.status === 'rejected'
          ? data.rejectionReason
          : existing?.rejectionReason,
      recordedByUid: context?.uid,
    });

    recordedLessonIds.push(lessonId);
  }

  console.log(
    `[hope] recorded ${recordedLessonIds.length} as ${data.status}` +
      (skipped.length > 0 ? `, skipped ${skipped.length}` : ''),
  );

  return { recordedLessonIds, skipped };
}
