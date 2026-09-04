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
 * `status` includes 'rendered' for #282 Hope Scholarship handling (Hope
 * invoicing is per-rendered-lesson).
 *
 * 'no-show' is NOT a flavour of 'cancelled' and NOT a flavour of 'rendered'.
 * It is its own fact, because the two programs treat it oppositely (#796):
 *
 *   - Private pay: the slot was held and the teacher was there, so the family
 *     is charged exactly as if the lesson had happened.
 *   - Hope Scholarship: Hope pays only for services *rendered*, and the family
 *     does not owe it privately either. Nobody is charged; the studio absorbs
 *     it, and it must never reach an EMA submission.
 *
 * Recording a no-show as 'rendered' would bill Hope for a service never
 * rendered; recording it as 'cancelled' would lose the fact and drop the
 * teacher's payout credit on the private-pay side. Hence a third status.
 */

import type { Room } from './room';

export type LessonStatus =
  | 'scheduled'
  | 'rendered'
  | 'no-show'
  | 'cancelled';

export const LESSON_STATUSES: LessonStatus[] = [
  'scheduled',
  'rendered',
  'no-show',
  'cancelled',
];

/**
 * Statuses meaning "the teacher turned up and the slot was consumed".
 *
 * This is the private-pay billing trigger and the room-occupancy test — the
 * room was genuinely used either way. It is deliberately NOT the Hope
 * submission test; see `isSubmittableToHope`.
 */
export const LESSON_SLOT_CONSUMED_STATUSES: LessonStatus[] = [
  'rendered',
  'no-show',
];

export function didConsumeSlot(status: LessonStatus): boolean {
  return LESSON_SLOT_CONSUMED_STATUSES.includes(status);
}

/**
 * May this lesson be billed to the Hope Scholarship?
 *
 * Only a genuinely rendered lesson. Hope funds cannot be retained for services
 * not rendered, so a no-show is structurally excluded here rather than filtered
 * out in a UI somewhere — the exclusion has to be impossible to forget.
 */
export function isSubmittableToHope(status: LessonStatus): boolean {
  return status === 'rendered';
}

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
   * The weekly LessonBlock this lesson is attributed to (#686). Required for
   * lessons created after blocks shipped — a lesson must fall on the block's
   * weekday and inside its window. Optional/null for grandfathered lessons
   * created before blocks; those surface as "unattributed" for an admin to fix.
   */
  blockId?: string | null;
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
  /** Weekly block every lesson in the series is attributed to (#686). */
  blockId?: string | null;
}

export function isLessonUpcoming(
  lesson: Lesson,
  now: Date = new Date(),
): boolean {
  return (
    lesson.status === 'scheduled' &&
    lesson.scheduledAt.getTime() > now.getTime()
  );
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
  currentPrimaryTeacherId?: string,
): boolean {
  const baseline = lesson.primaryTeacherAtCreateId ?? currentPrimaryTeacherId;
  if (!baseline) {
    // No snapshot and no current primary — cannot conclude substitute.
    return false;
  }
  return lesson.teacherId !== baseline;
}
