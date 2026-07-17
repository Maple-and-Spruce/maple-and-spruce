/**
 * Get Lessons Cloud Function
 *
 * Lists music lessons with optional filters. Dates arrive as ISO strings
 * over the wire and are coerced to Date before querying.
 */
import {
  createRoleFunction,
  Role,
} from '@maple/firebase/functions';
import { LessonRepository } from '@maple/firebase/database';
import type {
  GetLessonsRequest,
  GetLessonsResponse,
} from '@maple/ts/firebase/api-types';

export const getLessons = createRoleFunction<
  GetLessonsRequest,
  GetLessonsResponse
>(async (data) => {
  const lessons = await LessonRepository.findAll({
    studentId: data.studentId,
    teacherId: data.teacherId,
    seriesId: data.seriesId,
    status: data.status,
    from: data.from ? new Date(data.from) : undefined,
    to: data.to ? new Date(data.to) : undefined,
  });

  return { lessons };
}, [Role.Admin, Role.LessonTeacher]);
