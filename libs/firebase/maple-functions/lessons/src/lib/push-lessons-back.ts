/**
 * pushLessonsBack — move a lesson and every later one of the student's back a
 * week (or a few).
 *
 * Katie is out on a Tuesday, or the family is away. Moving the lessons one by
 * one does not work: the first lands on the second, and the room check refuses
 * it because the room is taken by that same student's lesson. This moves them
 * together, so the only clashes it reports are with someone else.
 *
 * Everything is checked before anything is written: the teacher may manage
 * each lesson, each new date fits the lesson's block, and the room is free at
 * each new time apart from the lessons that are moving out of the way. A
 * refusal moves nothing.
 *
 * Payments stay with the lessons. A charge or invoice names lesson ids, and the
 * ids do not change, so a paid lesson is still paid on its new date.
 */
import {
  assertCanManageLesson,
  type FunctionContext,
  findConflictsForWindow,
  resolveLessonBlock,
  throwFailedPrecondition,
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import { LessonRepository } from '@maple/firebase/database';
import {
  MAX_PUSH_WEEKS,
  describeRoomConflict,
  isValidPushWeeks,
  lessonOccupiedRoom,
  planPushLessonsBack,
} from '@maple/ts/domain';
import type {
  PushLessonsBackRequest,
  PushLessonsBackResponse,
} from '@maple/ts/firebase/api-types';

function dayLabel(at: Date): string {
  return at.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}

export async function pushLessonsBack(
  data: PushLessonsBackRequest,
  context: FunctionContext,
): Promise<PushLessonsBackResponse> {
  if (!data?.lessonId) throwInvalidArgument('Which lesson?');
  const weeks = data.weeks ?? 1;
  if (!isValidPushWeeks(weeks)) {
    throwInvalidArgument(
      `Lessons can be pushed back 1 to ${MAX_PUSH_WEEKS} weeks.`,
    );
  }

  const anchor = await LessonRepository.findById(data.lessonId);
  if (!anchor) throwNotFound('Lesson', data.lessonId);
  if (anchor.status !== 'scheduled') {
    throwFailedPrecondition(
      'Only a lesson that is still scheduled can be pushed back.',
    );
  }
  // A past lesson counts as taught (#157); moving it would rewrite history.
  if (anchor.scheduledAt.getTime() < Date.now()) {
    throwFailedPrecondition('A lesson that has already happened cannot be pushed back.');
  }

  const lessons = await LessonRepository.findAll({
    studentId: anchor.studentId,
    from: anchor.scheduledAt,
  });
  const plan = planPushLessonsBack(anchor, lessons, weeks);

  // A lesson teacher may only move lessons they teach. Checked for every
  // lesson, since a student can have had more than one teacher.
  for (const teacherId of new Set(plan.map((p) => p.lesson.teacherId))) {
    await assertCanManageLesson(context, teacherId);
  }

  const movingRefs = new Set(plan.map((p) => `lessons/${p.lesson.id}`));

  // Every check before any write, so a refusal leaves the calendar as it was.
  const blockIds = new Map<string, string | null | undefined>();
  for (const { lesson, to } of plan) {
    if (lesson.blockId) {
      try {
        blockIds.set(
          lesson.id,
          await resolveLessonBlock({
            strategy: undefined,
            blockId: lesson.blockId,
            teacherId: lesson.teacherId,
            scheduledAts: [to],
            durationMinutes: lesson.durationMinutes,
            recurring: false,
            context,
          }),
        );
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throwFailedPrecondition(`${dayLabel(to)}: ${reason}`);
      }
    }

    const room = lessonOccupiedRoom(lesson);
    if (!room) continue; // Held online: no room to clash over.
    const conflicts = (
      await findConflictsForWindow({
        room,
        scheduledAt: to,
        durationMinutes: lesson.durationMinutes,
      })
    ).filter(
      (conflict) =>
        !conflict.event.sourceRef || !movingRefs.has(conflict.event.sourceRef),
    );
    if (conflicts.length > 0) {
      throwFailedPrecondition(
        `${dayLabel(to)}: ${describeRoomConflict(conflicts[0])}`,
      );
    }
  }

  // Latest first, so no lesson is ever written onto one that has not moved.
  const moved = [];
  for (const { lesson, to } of plan) {
    moved.push(
      await LessonRepository.update({
        id: lesson.id,
        scheduledAt: to,
        ...(blockIds.has(lesson.id)
          ? { blockId: blockIds.get(lesson.id) }
          : {}),
      }),
    );
  }

  return {
    lessons: moved.sort(
      (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime(),
    ),
  };
}
