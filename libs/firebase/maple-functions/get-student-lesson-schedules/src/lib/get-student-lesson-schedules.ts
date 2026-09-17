/**
 * getStudentLessonSchedules (legacy #797)
 *
 * The standing arrangements — what Katie edits, instead of rows of lessons.
 * A lesson teacher may read their own.
 */
import {
  Functions,
  Role,
  instructorScopeForUser,
} from '@maple/firebase/functions';
import { StudentLessonScheduleRepository } from '@maple/firebase/database';
import type {
  GetStudentLessonSchedulesRequest,
  GetStudentLessonSchedulesResponse,
} from '@maple/ts/firebase/api-types';

export const getStudentLessonSchedules = Functions.endpoint
  .requiringRole([Role.Admin, Role.LessonTeacher])
  .handle<GetStudentLessonSchedulesRequest, GetStudentLessonSchedulesResponse>(
    async (data, context) => {
      // A lesson teacher sees only their own arrangements, whatever they ask
      // for; an admin sees whatever they asked for.
      //
      // This used `instructorIdForUser` directly, which scoped ANY caller with
      // a linked instructor record to themselves — including an admin who also
      // teaches, which Katie does. The day column's "all teachers" view (legacy #838)
      // would then have silently shown only her own students.
      // `instructorScopeForUser` is the helper that makes the admin case
      // explicit: it returns no instructorId for an admin.
      const { instructorId } = await instructorScopeForUser(context);
      const schedules = await StudentLessonScheduleRepository.findAll({
        studentId: data?.studentId,
        teacherId: instructorId ?? data?.teacherId,
        status: data?.status,
      });
      return { schedules };
    }
  );
