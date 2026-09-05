/**
 * updateStudentLessonSchedule (#797)
 *
 * Changing the arrangement — a new day, a new time, or ending it — is **one
 * edit**, which is the whole point of the entity existing.
 *
 * Lessons already materialised are deliberately left alone. They are concrete
 * facts, some of them already taught, invoiced, or paid, and rewriting them
 * from a schedule change would rewrite history. The new pattern applies going
 * forward; anything already on the books that should move is moved as an
 * ordinary lesson edit.
 */
import {
  Functions,
  Role,
  assertCanManageLesson,
  assertLessonsFitBlock,
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import { StudentLessonScheduleRepository } from '@maple/firebase/database';
import { scheduleOccurrences, scheduleHorizonEnd } from '@maple/ts/domain';
import type {
  UpdateStudentLessonScheduleRequest,
  UpdateStudentLessonScheduleResponse,
} from '@maple/ts/firebase/api-types';

function coerceDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(value as string);
}

export const updateStudentLessonSchedule = Functions.endpoint
  .requiringRole([Role.Admin, Role.LessonTeacher])
  .handle<
    UpdateStudentLessonScheduleRequest,
    UpdateStudentLessonScheduleResponse
  >(async (data, context) => {
    if (!data.id) throwInvalidArgument('Schedule ID is required');

    const existing = await StudentLessonScheduleRepository.findById(data.id);
    if (!existing) throwNotFound('Lesson schedule', data.id);

    await assertCanManageLesson(context, existing.teacherId);

    const merged = {
      ...existing,
      ...data,
      startsOn: data.startsOn ? coerceDate(data.startsOn) : existing.startsOn,
      endsOn: data.endsOn ? coerceDate(data.endsOn) : existing.endsOn,
    };

    if (merged.endsOn && merged.endsOn < merged.startsOn) {
      throwInvalidArgument('The end date is before the start date');
    }

    // Re-check block fit whenever the pattern moves, so an arrangement can
    // never be edited into a shape that generates rejectable lessons.
    const movedPattern =
      data.dayOfWeek !== undefined ||
      data.startMinutes !== undefined ||
      data.durationMinutes !== undefined ||
      data.blockId !== undefined;

    if (movedPattern && merged.status === 'active') {
      const sample = scheduleOccurrences(
        { ...merged, status: 'active' },
        new Date(),
        scheduleHorizonEnd(new Date(), 3)
      );
      if (sample.length > 0) {
        await assertLessonsFitBlock({
          blockId: merged.blockId,
          teacherId: merged.teacherId,
          scheduledAts: sample,
          durationMinutes: merged.durationMinutes,
        });
      }
    }

    const schedule = await StudentLessonScheduleRepository.update({
      ...data,
      startsOn: data.startsOn ? coerceDate(data.startsOn) : undefined,
      endsOn: data.endsOn ? coerceDate(data.endsOn) : undefined,
    });
    if (!schedule) throwNotFound('Lesson schedule', data.id);

    return { schedule };
  });
