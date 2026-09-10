/**
 * Standing lesson schedule API contracts (#797).
 */
import type {
  BlockStrategy,
  CreateStudentLessonScheduleInput,
  StudentLessonSchedule,
  UpdateStudentLessonScheduleInput,
} from '@maple/ts/domain';

export interface GetStudentLessonSchedulesRequest {
  studentId?: string;
  teacherId?: string;
  status?: StudentLessonSchedule['status'];
}

export interface GetStudentLessonSchedulesResponse {
  schedules: StudentLessonSchedule[];
}

export type CreateStudentLessonScheduleRequest =
  CreateStudentLessonScheduleInput & {
    /**
     * How to attribute the arrangement to a block when none fits yet (#835).
     *
     * This is the case the feature was built for: Katie describes a standing
     * weekly slot and the block is derivable from it, so she should not have to
     * go build one first. A recurring arrangement yields a recurring block.
     */
    blockStrategy?: BlockStrategy;
  };

export interface CreateStudentLessonScheduleResponse {
  schedule: StudentLessonSchedule;
  /**
   * Lessons materialised immediately, so creating an arrangement produces
   * visible lessons rather than waiting for the weekly job.
   */
  lessonsCreated: number;
}

export type UpdateStudentLessonScheduleRequest =
  UpdateStudentLessonScheduleInput;

export interface UpdateStudentLessonScheduleResponse {
  schedule: StudentLessonSchedule;
}

export interface MaterializeLessonSchedulesResult {
  schedulesConsidered: number;
  created: number;
  /** Occurrences that already had a lesson — the steady state, not a problem. */
  alreadyPresent: number;
  skippedInactiveStudent: number;
}
