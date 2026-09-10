/**
 * Create Lesson Cloud Function
 *
 * Admin + lesson-teacher (scoped-roles epic #617). A lesson teacher may only
 * create lessons they teach (the new lesson's teacherId must be their own
 * instructor id); admins may create for anyone. Used for first-lesson
 * bookings; recurring series use createLessonSeries.
 */
import {
  createRoleFunction,
  Role,
  assertCanManageLesson,
  assertRoomIsFree,
  resolveLessonBlock,
} from '@maple/firebase/functions';
import { LessonRepository, StudentRepository } from '@maple/firebase/database';
import { lessonValidation } from '@maple/ts/validation';
import type {
  CreateLessonRequest,
  CreateLessonResponse,
} from '@maple/ts/firebase/api-types';

export const createLesson = createRoleFunction<
  CreateLessonRequest,
  CreateLessonResponse
>(
  async (data, context) => {
    // A lesson teacher may only create a lesson assigned to themselves.
    await assertCanManageLesson(context, data.teacherId);

    // Dates arrive as ISO strings over the wire; coerce before validation.
    const coerced = {
      ...data,
      scheduledAt:
        data.scheduledAt instanceof Date
          ? data.scheduledAt
          : new Date(data.scheduledAt as unknown as string),
    };

    const validationResult = lessonValidation(coerced);
    if (!validationResult.isValid()) {
      const errors = validationResult.getErrors();
      const errorMessages = Object.entries(errors)
        .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
        .join('; ');
      throw new Error(`Validation failed: ${errorMessages}`);
    }

    // Block attribution (#686), with the #835 escape hatches: the caller may
    // pass a `blockStrategy` asking for a block to be derived from this lesson
    // or for a nearby one to be widened, instead of dead-ending when none fits.
    // `recurring: false` — a single lesson is not standing availability, so any
    // block derived here covers only its own date.
    const blockId = await resolveLessonBlock({
      strategy: data.blockStrategy,
      blockId: coerced.blockId,
      teacherId: coerced.teacherId,
      scheduledAts: [coerced.scheduledAt],
      durationMinutes: coerced.durationMinutes,
      recurring: false,
      context,
    });

    // Two things cannot be in the room at once (#841). Checked against
    // calendar events, so a rental or a Music Together class blocks the slot
    // just as another lesson would.
    await assertRoomIsFree([
      {
        room: coerced.room,
        scheduledAt: coerced.scheduledAt,
        durationMinutes: coerced.durationMinutes,
      },
    ]);

    const student = await StudentRepository.findById(coerced.studentId);
    if (!student) {
      throw new Error(`Student not found: ${coerced.studentId}`);
    }

    // Snapshot the student's current primary teacher so later reassignment
    // of the student can't retroactively flip substitute attribution for
    // this lesson. See #283 payout tracking.
    const lesson = await LessonRepository.create({
      ...coerced,
      blockId,
      primaryTeacherAtCreateId:
        coerced.primaryTeacherAtCreateId ?? student.primaryTeacherId,
    });

    return { lesson };
  },
  [Role.Admin, Role.LessonTeacher],
);
