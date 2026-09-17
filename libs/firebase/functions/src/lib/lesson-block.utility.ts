/**
 * Lesson ↔ block enforcement and derivation (legacy #686, legacy #835).
 *
 * New lessons must be attributed to a LessonBlock owned by the same teacher,
 * and every scheduled time must fall on the block's weekday and inside its
 * window (evaluated in the shop timezone). Grandfathered lessons created before
 * blocks shipped are exempt — enforcement runs on create and on reschedule,
 * never on incidental status/notes edits.
 *
 * legacy #835 removes the dead end where no suitable block exists yet. Rather than
 * refusing until Katie goes and builds one, the caller may ask for a block to
 * be **derived** from what is being scheduled, or for a nearby block to be
 * **widened** to fit.
 *
 * Two rules keep that from quietly corrupting the schedule:
 *
 *   1. **A derived block claims exactly what its source claims.** A standing
 *      weekly arrangement yields a recurring block; a single lesson yields a
 *      block scoped to that one date. A block is what `get-my-week` reads as a
 *      teacher's standing availability, so a makeup lesson minting a weekly
 *      block would be a lie about when they work.
 *   2. **Widening a recurring block is Katie's decision, never a default.**
 *      It changes that weekday for every future lesson, so the caller must ask
 *      for it explicitly and be an admin.
 *
 * Call BEFORE any write.
 */
import { LessonBlockRepository } from '@maple/firebase/database';
import {
  lessonFitsBlock,
  planBlockAttribution,
  weekdayIndexInZone,
  zonedDateKey,
  DEFAULT_LESSON_TIME_ZONE,
} from '@maple/ts/domain';
import type { BlockStrategy, LessonBlock } from '@maple/ts/domain';
import { hasRole, Role } from './auth.utility';
import { throwInvalidArgument, throwPermissionDenied } from './errors.utility';
import type { FunctionContext } from './functions.utility';

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

/**
 * Turn a caller's block choice into the block id to attribute a lesson to,
 * creating or widening a block when that is what was asked for.
 *
 * Returns the id; the caller writes the lesson. Nothing here writes a lesson,
 * so a validation failure downstream leaves at most a block behind — an
 * unused block is inert, where a lesson attributed to a block that was never
 * created would be corrupt.
 */
export async function resolveLessonBlock(params: {
  strategy: BlockStrategy | undefined;
  /** Fallback when no strategy is given — the pre-#835 contract. */
  blockId?: string | null;
  teacherId: string;
  /** Every time the lesson (or arrangement) will occupy. */
  scheduledAts: Date[];
  durationMinutes: number;
  /**
   * Does this repeat weekly? Decides whether a derived block may claim
   * standing availability.
   */
  recurring: boolean;
  context: FunctionContext;
}): Promise<string> {
  const {
    strategy,
    blockId,
    teacherId,
    scheduledAts,
    durationMinutes,
    recurring,
    context,
  } = params;

  // No strategy: behave exactly as before legacy #835.
  if (!strategy || strategy.mode === 'existing') {
    const chosen = strategy?.mode === 'existing' ? strategy.blockId : blockId;
    await assertLessonsFitBlock({
      blockId: chosen,
      teacherId,
      scheduledAts,
      durationMinutes,
    });
    return chosen as string;
  }

  if (scheduledAts.length === 0) {
    throwInvalidArgument('There is nothing to schedule.');
  }

  // A one-off block covers a single date, so it cannot host a weekly
  // arrangement — every week after the first would come back unattributed.
  // Caught here rather than by the fit check below, which would already have
  // created the block before failing.
  if (recurring && strategy.mode === 'extend' && strategy.scope === 'this-date') {
    throwInvalidArgument(
      'A weekly arrangement needs a weekly block. Extend the block for every week, or pick a time inside it.'
    );
  }

  // Plan from the first occurrence. Every occurrence of a recurring
  // arrangement shares a weekday and wall-clock time, and a one-off has only
  // one — so the first is representative either way. The final fit check below
  // still tests every occurrence.
  const blocks = await LessonBlockRepository.findAll({ teacherId });
  const plan = planBlockAttribution(blocks, {
    teacherId,
    scheduledAt: scheduledAts[0],
    durationMinutes,
    recurring,
  });

  if (plan.blocked) {
    throwInvalidArgument(plan.blocked);
  }

  const isAdmin = !!context.uid && (await hasRole(context.uid, Role.Admin));

  let resolvedId: string;

  if (strategy.mode === 'create') {
    const draft = plan.draft;
    if (!draft) {
      throwInvalidArgument('No block can be created for this time.');
    }
    // A recurring block is standing availability, and only Katie shapes that.
    // A one-off block grants nothing beyond the lesson itself, so a lesson
    // teacher scheduling their own lesson may create one.
    if (!draft.onDate && !isAdmin) {
      throwPermissionDenied(
        'Only an admin can add a weekly block. Schedule this as a single lesson instead.'
      );
    }
    const created = await LessonBlockRepository.create(draft);
    resolvedId = created.id;
  } else {
    const target = plan.extensions.find(
      (e) => e.block.id === strategy.blockId
    );
    if (!target) {
      // Either the block moved since the caller looked, or it was never a
      // candidate. Refuse rather than widening something by an unbounded gap.
      throwInvalidArgument(
        'That block can no longer be extended to fit this lesson. Reload and try again.'
      );
    }

    if (strategy.scope === 'weekly') {
      if (!isAdmin) {
        throwPermissionDenied(
          'Only an admin can change a weekly block. Extend it for this date instead.'
        );
      }
      if (target.block.onDate) {
        throwInvalidArgument(
          'That block already applies to a single date, so there is no weekly window to change.'
        );
      }
      const updated = await LessonBlockRepository.update({
        id: target.block.id,
        startMinutes: target.startMinutes,
        endMinutes: target.endMinutes,
      });
      resolvedId = updated.id;
    } else {
      // "Just this date" leaves the weekly block untouched and lays a one-off
      // over it, so a single run-over never widens every future week.
      const onDate = zonedDateKey(scheduledAts[0], DEFAULT_LESSON_TIME_ZONE);
      const created = await LessonBlockRepository.create({
        teacherId,
        dayOfWeek: weekdayIndexInZone(
          scheduledAts[0],
          DEFAULT_LESSON_TIME_ZONE
        ),
        startMinutes: target.startMinutes,
        endMinutes: target.endMinutes,
        onDate,
        label: target.block.label,
      });
      resolvedId = created.id;
    }
  }

  // Re-check every occurrence against what we actually produced. The plan was
  // made from the first one; this is what proves the rest fit, and it is the
  // same assertion an `existing` strategy goes through.
  await assertLessonsFitBlock({
    blockId: resolvedId,
    teacherId,
    scheduledAts,
    durationMinutes,
  });

  return resolvedId;
}
