/**
 * Studio day API types (#235): every teacher's lessons for a day, for the
 * admin Home dashboard. `getMyDayLessons` is scoped to the caller's own
 * lessons; this is the studio-wide view, admin-only.
 */
import type { Lesson, LessonPaymentStateKind } from '@maple/ts/domain';

export interface StudioDayPayment {
  state: LessonPaymentStateKind;
  /** ISO timestamp a scheduled card charge will run. */
  dueAt?: string;
}

export interface StudioDayLesson {
  lesson: Lesson;
  studentName: string;
  teacherName: string;
  /** The student's instrument, as the studio labels it. */
  instrument?: string;
  payment: StudioDayPayment;
}

export interface GetStudioDayRequest {
  /** ISO timestamps bounding the day. Defaults to today in the shop timezone. */
  from?: string;
  to?: string;
}

export interface GetStudioDayResponse {
  /** Not cancelled, sorted by start time. */
  lessons: StudioDayLesson[];
}
