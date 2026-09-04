/**
 * recordHopeSubmissions Cloud Function (#799)
 *
 * Records what has been claimed from the EMA portal for a batch of rendered
 * Hope lessons — Katie submits a term's worth at once, so this is bulk by
 * default rather than one call per lesson.
 *
 * THE GUARD IS HERE, NOT IN THE UI
 * --------------------------------
 * Hope pays only for services rendered. Every lesson is re-checked server-side
 * against `isSubmittableToHope` and against the student actually being a Hope
 * student, so a no-show (#796) cannot be claimed even if a client asks for it.
 * A refused lesson is *skipped and reported*, not thrown — one bad id in a
 * batch of forty must not lose the other thirty-nine.
 *
 * The rate is stamped at record time. A later rate change must not retroactively
 * restate what EMA was actually told.
 */
import {
  Functions,
  Role,
  throwInvalidArgument,
} from '@maple/firebase/functions';
import {
  HopeSubmissionRepository,
  LessonRepository,
  StudentRepository,
} from '@maple/firebase/database';
import {
  HOPE_SUBMISSION_STATUSES,
  getHopePerLessonRateCents,
  isSubmittableToHope,
} from '@maple/ts/domain';
import type { LessonLength } from '@maple/ts/domain';
import type {
  RecordHopeSubmissionsRequest,
  RecordHopeSubmissionsResponse,
} from '@maple/ts/firebase/api-types';

function rateFor(
  registeredLessonLength: LessonLength | undefined,
  durationMinutes: number
): number {
  if (registeredLessonLength) {
    return getHopePerLessonRateCents(registeredLessonLength);
  }
  if (durationMinutes >= 60) return getHopePerLessonRateCents('60-min');
  if (durationMinutes >= 45) return getHopePerLessonRateCents('45-min');
  return getHopePerLessonRateCents('30-min-full');
}

export const recordHopeSubmissions = Functions.endpoint
  .requiringRole(Role.Admin)
  .handle<RecordHopeSubmissionsRequest, RecordHopeSubmissionsResponse>(
    async (data, context) => {
      const lessonIds = data?.lessonIds ?? [];
      if (lessonIds.length === 0) {
        throwInvalidArgument('At least one lesson is required');
      }
      if (!HOPE_SUBMISSION_STATUSES.includes(data.status)) {
        throwInvalidArgument(`Unknown Hope submission status: ${data.status}`);
      }

      const now = new Date();
      const recordedLessonIds: string[] = [];
      const skipped: Array<{ lessonId: string; reason: string }> = [];

      for (const lessonId of lessonIds) {
        const lesson = await LessonRepository.findById(lessonId);
        if (!lesson) {
          skipped.push({ lessonId, reason: 'Lesson not found' });
          continue;
        }

        if (!isSubmittableToHope(lesson.status)) {
          // The important one. Hope funds cannot be retained for services not
          // rendered, so a no-show or a cancellation can never be claimed.
          skipped.push({
            lessonId,
            reason: `Hope can only be billed for a rendered lesson (this one is ${lesson.status})`,
          });
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

        await HopeSubmissionRepository.record({
          lessonId,
          studentId: lesson.studentId,
          teacherId: lesson.teacherId,
          lessonDate: lesson.scheduledAt,
          status: data.status,
          // Keep the rate the claim was originally made at; only stamp a new
          // one when there was nothing claimed before.
          rateCents:
            existing?.rateCents ??
            rateFor(student.registeredLessonLength, lesson.durationMinutes),
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
          (skipped.length > 0 ? `, skipped ${skipped.length}` : '')
      );

      return { recordedLessonIds, skipped };
    }
  );
