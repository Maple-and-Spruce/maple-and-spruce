/**
 * getHopeQueue Cloud Function (legacy #799)
 *
 * "What have we taught a Hope student and not yet been paid for?" — a question
 * that previously had no answer anywhere in the portal.
 *
 * Hope-ness lives on the Student, not the Lesson, so the queue starts from Hope
 * students and fans out to their lessons rather than the other way round. At
 * studio volume that is a handful of reads and needs no composite index.
 *
 * NO-SHOWS ARE EXCLUDED STRUCTURALLY. The lesson query asks for `rendered`, and
 * `isSubmittableToHope` is the only test used anywhere for "may Hope be billed
 * for this" (legacy #796). Hope pays for services rendered; a no-show is charged to
 * nobody, and that must not depend on a UI remembering to filter.
 */
import {
  HopeOrderRepository,
  HopeProductRepository,
  HopeSubmissionRepository,
  LessonRepository,
  StudentRepository,
} from '@maple/firebase/database';
import {
  allocateHopeLessons,
  isSubmittableToHope,
  resolveHopeLessonRate,
  summarizeHopeQueue,
} from '@maple/ts/domain';
import type { HopeQueueEntry } from '@maple/ts/domain';
import type {
  GetHopeQueueRequest,
  GetHopeQueueResponse,
  HopeOrderWithRoom,
} from '@maple/ts/firebase/api-types';

export async function getHopeQueue(
  data: GetHopeQueueRequest,
): Promise<GetHopeQueueResponse> {
  const [students, products] = await Promise.all([
    StudentRepository.findAll(),
    HopeProductRepository.findAll(),
  ]);
  const productsById = new Map(products.map((p) => [p.id, p]));
  const hopeStudents = students.filter(
    (s) => s.isHopeScholarship && (!data?.studentId || s.id === data.studentId),
  );

  const from = data?.from ? new Date(data.from) : undefined;
  const to = data?.to ? new Date(data.to) : undefined;

  const entries: HopeQueueEntry[] = [];
  const now = new Date();

  for (const student of hopeStudents) {
    // Every lesson, not just 'rendered' ones: a past lesson nobody removed
    // happened (#157), so the status alone no longer says what Hope owes.
    const lessons = await LessonRepository.findAll({ studentId: student.id });

    for (const lesson of lessons) {
      // The single test that decides what Hope may be billed for.
      if (!isSubmittableToHope(lesson, now)) continue;
      if (from && lesson.scheduledAt < from) continue;
      if (to && lesson.scheduledAt > to) continue;

      // What EMA pays for this student's product. With no product the
      // lesson is unpriced: no number, and the UI asks for a product.
      const rate = resolveHopeLessonRate(student, productsById);
      entries.push({
        lesson,
        studentId: student.id,
        studentName: student.name,
        registeredLessonLength: student.registeredLessonLength,
        rateCents: rate.rateCents,
        rateSource: rate.source,
        productName: rate.product?.name,
      });
    }
  }

  const submissions = await HopeSubmissionRepository.findByLessonIds(
    entries.map((e) => e.lesson.id),
  );
  for (const entry of entries) {
    const submission = submissions.get(entry.lesson.id);
    if (submission) entry.submission = submission;
  }

  // Where each taught lesson stands against the family's EMA orders: needs
  // an order, ready to invoice (priced at that order), or invoiced.
  const allOrders = await HopeOrderRepository.findAll(
    data?.studentId ? { studentId: data.studentId } : {},
  );
  const orders: HopeOrderWithRoom[] = [];
  for (const student of hopeStudents) {
    const studentOrders = allOrders.filter((o) => o.studentId === student.id);
    const studentEntries = entries.filter((e) => e.studentId === student.id);
    const { states, remainingByOrder } = allocateHopeLessons(
      studentEntries.map((e) => ({
        lessonId: e.lesson.id,
        scheduledAt: e.lesson.scheduledAt,
        submission: e.submission,
      })),
      studentOrders,
    );
    for (const entry of studentEntries) {
      const state = states.get(entry.lesson.id);
      entry.state = state;
      if (state?.kind === 'ready-to-invoice') {
        const order = studentOrders.find((o) => o.id === state.orderId);
        if (order) {
          entry.rateCents = order.priceCents;
          entry.rateSource = 'product';
        }
      }
    }
    for (const order of studentOrders) {
      orders.push({ ...order, remaining: remainingByOrder.get(order.id) ?? 0 });
    }
  }

  // Oldest first: the longest-unclaimed lesson is the most urgent, and after
  // a backfill the queue is mostly history.
  entries.sort(
    (a, b) => a.lesson.scheduledAt.getTime() - b.lesson.scheduledAt.getTime(),
  );

  return { entries, totals: summarizeHopeQueue(entries), orders };
}
