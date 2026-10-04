/**
 * createStudentLessonSchedule (legacy #797)
 *
 * Records a student's weekly time. It books nothing (#157): the weekly time is
 * a planning note, and lessons are booked a few at a time when the family pays
 * for them (`planNextLessons`).
 *
 * The arrangement must fit its block, exactly as an individual lesson must
 * (legacy #686) — checked here against a representative occurrence so a schedule can
 * never be created that would generate lessons the lesson rules would reject.
 */
import {
  Functions,
  Role,
  assertCanManageLesson,
  resolveLessonBlock,
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import {
  StudentLessonScheduleRepository,
  StudentRepository,
} from '@maple/firebase/database';
import {
  MAX_SCHEDULE_INTERVAL_WEEKS,
  isValidScheduleInterval,
  scheduleHorizonEnd,
  scheduleOccurrences,
} from '@maple/ts/domain';
import type {
  CreateStudentLessonScheduleRequest,
  CreateStudentLessonScheduleResponse,
} from '@maple/ts/firebase/api-types';

function coerceDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(value as string);
}

export const createStudentLessonSchedule = Functions.endpoint
  .requiringRole([Role.Admin, Role.LessonTeacher])
  .handle<
    CreateStudentLessonScheduleRequest,
    CreateStudentLessonScheduleResponse
  >(async (data, context) => {
    await assertCanManageLesson(context, data.teacherId);

    const student = await StudentRepository.findById(data.studentId);
    if (!student) throwNotFound('Student', data.studentId);

    const input = {
      ...data,
      startsOn: coerceDate(data.startsOn),
      endsOn: data.endsOn ? coerceDate(data.endsOn) : undefined,
    };

    if (input.endsOn && input.endsOn < input.startsOn) {
      throwInvalidArgument('The end date is before the start date');
    }

    if (
      input.intervalWeeks !== undefined &&
      !isValidScheduleInterval(input.intervalWeeks)
    ) {
      throwInvalidArgument(
        `Weeks between lessons must be a whole number from 1 to ${MAX_SCHEDULE_INTERVAL_WEEKS}`
      );
    }

    // Check the arrangement against its block using its first few occurrences.
    // Every occurrence shares a weekday and wall-clock time, so a handful is
    // enough to prove the pattern fits — and catches a schedule whose time sits
    // outside the block, which would otherwise fail silently every week.
    const sample = scheduleOccurrences(
      { ...input, status: 'active' },
      input.startsOn,
      scheduleHorizonEnd(input.startsOn, 3)
    );
    if (sample.length === 0) {
      throwInvalidArgument(
        'That arrangement never occurs — check the weekday and the start date.'
      );
    }
    // The primary legacy #835 case. Katie describes a standing weekly arrangement —
    // "Rowan, Tuesdays 4pm, indefinitely" — and the block is fully derivable
    // from it, so making her go create one by hand first is pure friction. A
    // standing arrangement *is* standing weekly availability, so the derived
    // block claims nothing the arrangement doesn't already.
    const blockId = await resolveLessonBlock({
      strategy: data.blockStrategy,
      blockId: input.blockId,
      teacherId: input.teacherId,
      scheduledAts: sample,
      durationMinutes: input.durationMinutes,
      recurring: true,
      context,
    });

    const schedule = await StudentLessonScheduleRepository.create({
      ...input,
      blockId,
    });

    return { schedule };
  });
