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
  resolveLessonBlock,
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import { StudentLessonScheduleRepository } from '@maple/firebase/database';
import {
  MAX_SCHEDULE_INTERVAL_WEEKS,
  isValidScheduleInterval,
  scheduleHorizonEnd,
  scheduleOccurrences,
} from '@maple/ts/domain';
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

    // The strategy is an instruction for this save, not a field of the
    // arrangement, so it never reaches the document.
    const { blockStrategy, ...changes } = data;

    const merged = {
      ...existing,
      ...changes,
      startsOn: changes.startsOn ? coerceDate(changes.startsOn) : existing.startsOn,
      endsOn: changes.endsOn ? coerceDate(changes.endsOn) : existing.endsOn,
    };

    if (merged.endsOn && merged.endsOn < merged.startsOn) {
      throwInvalidArgument('The end date is before the start date');
    }

    if (
      merged.intervalWeeks !== undefined &&
      !isValidScheduleInterval(merged.intervalWeeks)
    ) {
      throwInvalidArgument(
        `Weeks between lessons must be a whole number from 1 to ${MAX_SCHEDULE_INTERVAL_WEEKS}`
      );
    }

    // Re-check block fit whenever the pattern moves, so an arrangement can
    // never be edited into a shape that generates rejectable lessons.
    const movedPattern =
      changes.dayOfWeek !== undefined ||
      changes.startMinutes !== undefined ||
      changes.durationMinutes !== undefined ||
      changes.blockId !== undefined ||
      // Cadence moves WHICH WEEKS are this student's, so the sample of
      // occurrences to check against the block changes with it.
      changes.intervalWeeks !== undefined ||
      changes.startsOn !== undefined;

    let resolvedBlockId: string | undefined;
    if (movedPattern && merged.status === 'active') {
      const sample = scheduleOccurrences(
        { ...merged, status: 'active' },
        new Date(),
        scheduleHorizonEnd(new Date(), 3)
      );
      if (sample.length > 0) {
        // The dialog offers the same way through when a CHANGED time falls
        // outside every block (#835). This used to check fit only, dropping
        // the choice — so "Extend Tuesdays" could never save on an existing
        // arrangement. With no strategy it is exactly that fit check.
        resolvedBlockId = await resolveLessonBlock({
          strategy: blockStrategy,
          blockId: merged.blockId,
          teacherId: merged.teacherId,
          scheduledAts: sample,
          durationMinutes: merged.durationMinutes,
          recurring: true,
          context,
        });
      }
    }

    if (blockStrategy && !resolvedBlockId) {
      throwInvalidArgument(
        'There is no upcoming lesson in this arrangement to fit a block to.'
      );
    }

    const schedule = await StudentLessonScheduleRepository.update({
      ...changes,
      ...(blockStrategy ? { blockId: resolvedBlockId } : {}),
      startsOn: changes.startsOn ? coerceDate(changes.startsOn) : undefined,
      endsOn: changes.endsOn ? coerceDate(changes.endsOn) : undefined,
    });
    if (!schedule) throwNotFound('Lesson schedule', data.id);

    return { schedule };
  });
