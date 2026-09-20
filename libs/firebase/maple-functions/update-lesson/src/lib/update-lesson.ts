/**
 * Update Lesson Cloud Function
 *
 * Admin + lesson-teacher (scoped-roles epic #49). A lesson teacher may only
 * update lessons they teach (ownership check on the lesson's teacherId);
 * admins may update any. Used for reschedule (scheduledAt), duration change,
 * substitute teacher, status transitions (scheduled ↔ cancelled; rendered is
 * set by legacy #282), and notes.
 */
import {
  createRoleFunction,
  Role,
  assertCanManageLesson,
  assertRoomIsFree,
  resolveLessonBlock,
  throwNotFound,
} from '@maple/firebase/functions';
import { LessonRepository } from '@maple/firebase/database';
import { lessonValidation } from '@maple/ts/validation';
import type {
  UpdateLessonRequest,
  UpdateLessonResponse,
} from '@maple/ts/firebase/api-types';

export const updateLesson = createRoleFunction<
  UpdateLessonRequest,
  UpdateLessonResponse
>(
  async (data, context) => {
    const existing = await LessonRepository.findById(data.id);
    if (!existing) {
      throwNotFound('Lesson', data.id);
    }

    // Ownership: a lesson teacher may only touch a lesson they currently teach.
    await assertCanManageLesson(context, existing.teacherId);

    // Coerce scheduledAt if caller sent a string, but only include it in
    // the update payload when it was actually provided — spreading
    // `scheduledAt: undefined` into `merged` below would wipe the
    // existing value during the merge-for-validation step.
    const coercedUpdates: UpdateLessonRequest = { ...data };
    if (data.scheduledAt !== undefined) {
      coercedUpdates.scheduledAt =
        data.scheduledAt instanceof Date
          ? data.scheduledAt
          : new Date(data.scheduledAt as unknown as string);
    }

    // Merge with existing so partial updates still pass full validation
    const merged = { ...existing, ...coercedUpdates };
    const validationResult = lessonValidation(merged);
    if (!validationResult.isValid()) {
      const errors = validationResult.getErrors();
      const errorMessages = Object.entries(errors)
        .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
        .join('; ');
      throw new Error(`Validation failed: ${errorMessages}`);
    }

    // Block enforcement (legacy #686): only when this update reschedules (time/duration)
    // or (re)attributes a block, AND a block is in effect. Grandfathered lessons
    // with no block stay editable for status/notes without being forced into one.
    const reschedules =
      coercedUpdates.scheduledAt !== undefined ||
      data.durationMinutes !== undefined;
    const reattributes = data.blockId !== undefined;
    // A `blockStrategy` is itself a reattribution — Katie moving a lesson to a
    // time no block covers and asking for one to be derived or widened (legacy #835).
    if ((reschedules || reattributes || data.blockStrategy) && (merged.blockId || data.blockStrategy)) {
      const resolvedBlockId = await resolveLessonBlock({
        strategy: data.blockStrategy,
        blockId: merged.blockId,
        teacherId: merged.teacherId,
        scheduledAts: [merged.scheduledAt],
        durationMinutes: merged.durationMinutes,
        recurring: false,
        context,
      });
      coercedUpdates.blockId = resolvedBlockId;
    }

    // Only when the booking actually moves. A status or notes edit must not
    // be refused because the lesson occupies its own slot (legacy #841), and the
    // lesson's own calendar event is excluded for the same reason.
    const movesInRoom =
      coercedUpdates.scheduledAt !== undefined ||
      data.durationMinutes !== undefined ||
      data.room !== undefined;

    if (movesInRoom && merged.status !== 'cancelled') {
      await assertRoomIsFree([
        {
          room: merged.room,
          scheduledAt: merged.scheduledAt,
          durationMinutes: merged.durationMinutes,
          excludeSourceRef: `lessons/${data.id}`,
        },
      ]);
    }

    const lesson = await LessonRepository.update(coercedUpdates);

    return { lesson };
  },
  [Role.Admin, Role.LessonTeacher],
);
