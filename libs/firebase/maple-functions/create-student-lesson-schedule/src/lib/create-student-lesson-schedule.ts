/**
 * createStudentLessonSchedule (#797)
 *
 * Creates a standing arrangement and materialises its lessons straight away, so
 * setting one up produces visible lessons rather than nothing until the weekly
 * job next runs.
 *
 * The arrangement must fit its block, exactly as an individual lesson must
 * (#686) — checked here against a representative occurrence so a schedule can
 * never be created that would generate lessons the lesson rules would reject.
 */
import {
  Functions,
  Role,
  assertCanManageLesson,
  assertLessonsFitBlock,
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import {
  StudentLessonScheduleRepository,
  StudentRepository,
} from '@maple/firebase/database';
import { runMaterializeLessonSchedules } from '@maple/firebase/maple-functions/materialize-lesson-schedules';
import { scheduleOccurrences, scheduleHorizonEnd } from '@maple/ts/domain';
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
    await assertLessonsFitBlock({
      blockId: input.blockId,
      teacherId: input.teacherId,
      scheduledAts: sample,
      durationMinutes: input.durationMinutes,
    });

    const schedule = await StudentLessonScheduleRepository.create(input);

    // Materialise now so the arrangement is immediately real.
    const materialized = await runMaterializeLessonSchedules(new Date());

    return { schedule, lessonsCreated: materialized.created };
  });
