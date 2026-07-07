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

import type { Room } from './room';

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
  /**
   * Student's primary teacher at the time this lesson was created.
   * Snapshotted so substitute-attribution in #283 payout tracking doesn't
   * retroactively flip if Katie later reassigns the student's primary
   * teacher. Optional for backwards-compat with lessons created before
   * this field was introduced — `wasTaughtBySubstitute` falls back to
   * the student's current `primaryTeacherId` when unset.
   */
  primaryTeacherAtCreateId?: string;
  /** Groups lessons generated together as a recurring series */
  seriesId?: string;
  /**
   * Bookable room the lesson occupies. Drives the room's calendar event
   * (`onLessonWrite`) and thus the /room-schedule. Optional for backwards-
   * compat with lessons created before this field existed; those fall back
   * to the Spruce Room in the calendar trigger.
   */
  room?: Room;
  status: LessonStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a single lesson. No id / timestamps / seriesId —
 * seriesId is only set when generating a recurring series via
 * CreateLessonSeriesInput. `primaryTeacherAtCreateId` is stamped by the
 * cloud function at create time from the student's current primary
 * teacher.
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
 * `primaryTeacherAtCreateId` is stamped by the server from the student's
 * current primary teacher at create time.
 */
export interface CreateLessonSeriesInput {
  studentId: string;
  teacherId: string;
  durationMinutes: number;
  /** Concrete list of scheduled start times to create, in order. */
  scheduledAts: Date[];
  notes?: string;
  /** Bookable room applied to every lesson in the series. */
  room?: Room;
  /** Snapshot stamp applied to every lesson in the series; set server-side. */
  primaryTeacherAtCreateId?: string;
}

export function isLessonUpcoming(lesson: Lesson, now: Date = new Date()): boolean {
  return lesson.status === 'scheduled' && lesson.scheduledAt.getTime() > now.getTime();
}

export function isLessonPast(lesson: Lesson, now: Date = new Date()): boolean {
  return lesson.scheduledAt.getTime() <= now.getTime();
}

/**
 * Was this lesson taught by someone other than the student's primary
 * teacher? Uses the snapshot `primaryTeacherAtCreateId` when available,
 * falls back to the student's current `primaryTeacherId` for legacy
 * lessons created before the snapshot field was introduced.
 *
 * Payout attribution in #283 relies on this: substitutes get credit for
 * lessons they actually taught, regardless of which teacher the student
 * is currently assigned to.
 */
export function wasTaughtBySubstitute(
  lesson: Pick<Lesson, 'teacherId' | 'primaryTeacherAtCreateId'>,
  currentPrimaryTeacherId?: string
): boolean {
  const baseline = lesson.primaryTeacherAtCreateId ?? currentPrimaryTeacherId;
  if (!baseline) {
    // No snapshot and no current primary — cannot conclude substitute.
    return false;
  }
  return lesson.teacherId !== baseline;
}
