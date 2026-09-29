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
import { Functions, Role } from '@maple/firebase/functions';
import {
  HopeProductRepository,
  HopeSubmissionRepository,
  LessonRepository,
  StudentRepository,
} from '@maple/firebase/database';
import {
  isSubmittableToHope,
  resolveHopeLessonRate,
  summarizeHopeQueue,
} from '@maple/ts/domain';
import type { HopeQueueEntry } from '@maple/ts/domain';
import type {
  GetHopeQueueRequest,
  GetHopeQueueResponse,
} from '@maple/ts/firebase/api-types';

export const getHopeQueue = Functions.endpoint
  .requiringRole(Role.Admin)
  .handle<GetHopeQueueRequest, GetHopeQueueResponse>(async (data) => {
    const [students, products] = await Promise.all([
      StudentRepository.findAll(),
      HopeProductRepository.findAll(),
    ]);
    const productsById = new Map(products.map((p) => [p.id, p]));
    const hopeStudents = students.filter(
      (s) =>
        s.isHopeScholarship &&
        (!data?.studentId || s.id === data.studentId)
    );

    const from = data?.from ? new Date(data.from) : undefined;
    const to = data?.to ? new Date(data.to) : undefined;

    const entries: HopeQueueEntry[] = [];

    for (const student of hopeStudents) {
      const lessons = await LessonRepository.findAll({
        studentId: student.id,
        status: 'rendered',
      });

      for (const lesson of lessons) {
        // Belt and braces: the query already asks for rendered, but this is the
        // single test that decides what Hope may be billed for.
        if (!isSubmittableToHope(lesson.status)) continue;
        if (from && lesson.scheduledAt < from) continue;
        if (to && lesson.scheduledAt > to) continue;

        // What EMA pays for this student's product; an estimate, flagged as
        // one, until the student is put on a product.
        const rate = resolveHopeLessonRate(student, lesson, productsById);
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
      entries.map((e) => e.lesson.id)
    );
    for (const entry of entries) {
      const submission = submissions.get(entry.lesson.id);
      if (submission) entry.submission = submission;
    }

    // Oldest first: the longest-unclaimed lesson is the most urgent, and after
    // a backfill the queue is mostly history.
    entries.sort(
      (a, b) => a.lesson.scheduledAt.getTime() - b.lesson.scheduledAt.getTime()
    );

    return { entries, totals: summarizeHopeQueue(entries) };
  });
