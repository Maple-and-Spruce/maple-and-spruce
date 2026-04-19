/**
 * Lesson domain types
 *
 * Represents individual music lessons scheduled for a Student.
 *
 * Recurring series are modeled as N Lesson records sharing a `seriesId` —
 * each instance is independently editable / cancellable without RRULE
 * exception semantics.
 *
 * `teacherId` on a Lesson is whoever actually taught it (primary or
 * substitute), which is what downstream payout tracking (#283) reads.
 *
 * `status` includes 'rendered' for forward-compat with #282 Hope
 * Scholarship handling (Hope invoicing is per-rendered-lesson); #279 only
 * uses 'scheduled' and 'cancelled' in the UI.
 */

export type LessonStatus = 'scheduled' | 'rendered' | 'cancelled';

export const LESSON_STATUSES: LessonStatus[] = [
  'scheduled',
  'rendered',
  'cancelled',
];

export interface Lesson {
  id: string;
  studentId: string;
  /** Scheduled start date/time */
  scheduledAt: Date;
  /** Lesson length in minutes (30, 45, 60) */
  durationMinutes: number;
  /** Actual teacher — primary for most lessons, substitute when applicable */
  teacherId: string;
  /** Groups lessons generated together as a recurring series */
  seriesId?: string;
  status: LessonStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a single lesson. No id / timestamps / seriesId —
 * seriesId is only set when generating a recurring series via
 * CreateLessonSeriesInput.
 */
export type CreateLessonInput = Omit<
  Lesson,
  'id' | 'createdAt' | 'updatedAt' | 'seriesId'
>;

export type UpdateLessonInput = Partial<
  Omit<Lesson, 'id' | 'studentId' | 'seriesId' | 'createdAt' | 'updatedAt'>
> & {
  id: string;
};

/**
 * Input for generating a recurring series. The client computes the final
 * date list (allowing per-date skips in the preview step) and submits it
 * here; the server writes all N lessons atomically with a shared seriesId.
 */
export interface CreateLessonSeriesInput {
  studentId: string;
  teacherId: string;
  durationMinutes: number;
  /** Concrete list of scheduled start times to create, in order. */
  scheduledAts: Date[];
  notes?: string;
}

export function isLessonUpcoming(lesson: Lesson, now: Date = new Date()): boolean {
  return lesson.status === 'scheduled' && lesson.scheduledAt.getTime() > now.getTime();
}

export function isLessonPast(lesson: Lesson, now: Date = new Date()): boolean {
  return lesson.scheduledAt.getTime() <= now.getTime();
}
