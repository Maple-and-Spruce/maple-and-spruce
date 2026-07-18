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
>(async (data, context) => {
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

  const student = await StudentRepository.findById(coerced.studentId);
  if (!student) {
    throw new Error(`Student not found: ${coerced.studentId}`);
  }

  // Snapshot the student's current primary teacher so later reassignment
  // of the student can't retroactively flip substitute attribution for
  // this lesson. See #283 payout tracking.
  const lesson = await LessonRepository.create({
    ...coerced,
    primaryTeacherAtCreateId:
      coerced.primaryTeacherAtCreateId ?? student.primaryTeacherId,
  });

  return { lesson };
}, [Role.Admin, Role.LessonTeacher]);
