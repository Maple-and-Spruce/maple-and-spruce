/**
 * Create Lesson Series Cloud Function
 *
 * Atomically creates N lessons sharing a seriesId. The client sends the
 * final list of scheduled dates (having already applied any holiday skips
 * in the preview step), so the server writes them as-is.
 */
import {
  createRoleFunction,
  Role,
  assertCanManageLesson,
  assertRoomIsFree,
  resolveLessonBlock,
} from '@maple/firebase/functions';
import { LessonRepository, StudentRepository } from '@maple/firebase/database';
import { lessonSeriesValidation } from '@maple/ts/validation';
import { isBackfillSeries } from '@maple/ts/domain';
import type {
  CreateLessonSeriesRequest,
  CreateLessonSeriesResponse,
} from '@maple/ts/firebase/api-types';

export const createLessonSeries = createRoleFunction<
  CreateLessonSeriesRequest,
  CreateLessonSeriesResponse
>(
  async (data, context) => {
    // A lesson teacher may only create a series they teach.
    await assertCanManageLesson(context, data.teacherId);

    // Dates arrive as ISO strings over the wire; coerce each one before validation.
    const coerced = {
      ...data,
      scheduledAts: (data.scheduledAts ?? []).map((d) =>
        d instanceof Date ? d : new Date(d as unknown as string),
      ),
    };

    const validationResult = lessonSeriesValidation(coerced);
    if (!validationResult.isValid()) {
      const errors = validationResult.getErrors();
      const errorMessages = Object.entries(errors)
        .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
        .join('; ');
      throw new Error(`Validation failed: ${errorMessages}`);
    }

    // Enforce block attribution (legacy #686): every lesson in the series must fit the
    // same block, owned by this teacher.
    //
    // A backfill of lessons that already happened is exempt (legacy #799). The block
    // rule stops *new* lessons being dropped at arbitrary times; a lesson that
    // already happened happened, whether or not a block covers that weekday,
    // and refusing to record it would mean refusing to claim money the studio
    // has already earned. Backfilled lessons carry `blockId: null` and surface
    // as "needs a block", the same grandfather path pre-block lessons use.
    // An explicitly supplied block is still validated either way.
    // A series repeats, so a block derived for it may claim the weekday
    // (legacy #835) — that is what the series asserts anyway.
    const isBackfill = isBackfillSeries(coerced);
    let seriesBlockId = coerced.blockId;
    if (!isBackfill || coerced.blockId || data.blockStrategy) {
      seriesBlockId = await resolveLessonBlock({
        strategy: data.blockStrategy,
        blockId: coerced.blockId,
        teacherId: coerced.teacherId,
        scheduledAts: coerced.scheduledAts,
        durationMinutes: coerced.durationMinutes,
        recurring: true,
        context,
      });
    }

    // Every date in the series, not just the first (legacy #841).
    await assertRoomIsFree(
      coerced.scheduledAts.map((scheduledAt) => ({
        room: coerced.room,
        scheduledAt,
        durationMinutes: coerced.durationMinutes,
      }))
    );

    const student = await StudentRepository.findById(coerced.studentId);
    if (!student) {
      throw new Error(`Student not found: ${coerced.studentId}`);
    }

    // Snapshot primary teacher on every lesson in the series so later
    // reassignment can't retroactively flip substitute attribution (legacy #283).
    const { lessons, seriesId } = await LessonRepository.createSeries({
      ...coerced,
      blockId: seriesBlockId,
      primaryTeacherAtCreateId:
        coerced.primaryTeacherAtCreateId ?? student.primaryTeacherId,
    });

    return { lessons, seriesId };
  },
  [Role.Admin, Role.LessonTeacher],
);
