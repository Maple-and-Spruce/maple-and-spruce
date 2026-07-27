/**
 * Lesson ↔ block enforcement (#686).
 *
 * New lessons must be attributed to a weekly LessonBlock owned by the same
 * teacher, and every scheduled time must fall on the block's weekday and inside
 * its window (evaluated in the shop timezone). Grandfathered lessons created
 * before blocks shipped are exempt — enforcement runs on create and on
 * reschedule, never on incidental status/notes edits.
 *
 * Call BEFORE any write.
 */
import { LessonBlockRepository } from '@maple/firebase/database';
import { lessonFitsBlock } from '@maple/ts/domain';
import { throwInvalidArgument } from './errors.utility';

export async function assertLessonsFitBlock(params: {
  blockId: string | null | undefined;
  teacherId: string;
  scheduledAts: Date[];
  durationMinutes: number;
}): Promise<void> {
  const { blockId, teacherId, scheduledAts, durationMinutes } = params;

  if (!blockId) {
    throwInvalidArgument(
      'A lesson must be attributed to a block. Create a block for this teacher first.'
    );
  }

  const block = await LessonBlockRepository.findById(blockId);
  if (!block) {
    throwInvalidArgument(`Block not found: ${blockId}`);
  }
  if (block.teacherId !== teacherId) {
    throwInvalidArgument('The selected block belongs to a different teacher.');
  }

  for (const scheduledAt of scheduledAts) {
    if (!lessonFitsBlock(scheduledAt, durationMinutes, block)) {
      throwInvalidArgument(
        "A lesson falls outside the selected block's day/time window."
      );
    }
  }
}
