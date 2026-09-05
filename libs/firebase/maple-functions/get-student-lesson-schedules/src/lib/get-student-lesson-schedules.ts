/**
 * getStudentLessonSchedules (#797)
 *
 * The standing arrangements — what Katie edits, instead of rows of lessons.
 * A lesson teacher may read their own.
 */
import { Functions, Role, instructorIdForUser } from '@maple/firebase/functions';
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
      const ownInstructorId = await instructorIdForUser(context?.uid);
      const schedules = await StudentLessonScheduleRepository.findAll({
        studentId: data?.studentId,
        teacherId: ownInstructorId ?? data?.teacherId,
        status: data?.status,
      });
      return { schedules };
    }
  );
