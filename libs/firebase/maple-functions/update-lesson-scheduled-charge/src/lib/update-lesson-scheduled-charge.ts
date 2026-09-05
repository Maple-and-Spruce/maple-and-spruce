/**
 * updateLessonScheduledCharge (#798) — the human override on a planned charge.
 *
 * Katie and Nathan have to be able to stop money before it moves. Two ways to
 * stop it, kept separate on purpose (same as the MT installment path):
 *
 *   `cancelled` — the teaching is not going to happen.
 *   `waived`    — the teaching happened and the studio is not charging for it.
 *
 * They are not the same fact, and a comped block has to stay legible on the
 * record months later, so `waived` carries a reason and the admin who set it.
 *
 * Only a `scheduled` charge can be stopped. Once a charge is `charging` the
 * money is already in flight and there is nothing to cancel; once it is `paid`
 * the remedy is a refund, not an edit.
 */
import {
  Functions,
  Role,
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import { LessonScheduledChargeRepository } from '@maple/firebase/database';
import type {
  UpdateLessonScheduledChargeRequest,
  UpdateLessonScheduledChargeResponse,
} from '@maple/ts/firebase/api-types';

export const updateLessonScheduledCharge = Functions.endpoint
  .requiringRole(Role.Admin)
  .handle<
    UpdateLessonScheduledChargeRequest,
    UpdateLessonScheduledChargeResponse
  >(async (data, context) => {
    if (!data.id) throwInvalidArgument('Charge ID is required');

    // The role gate guarantees an authenticated admin; assert it so the uid
    // recorded against a waiver is always a real person, never a blank.
    const adminUid = context.uid;
    if (!adminUid) throwInvalidArgument('Signed-in admin required');

    const existing = await LessonScheduledChargeRepository.findById(data.id);
    if (!existing) throwNotFound('Lesson charge', data.id);

    if (existing.status !== 'scheduled') {
      throwInvalidArgument(
        existing.status === 'charging'
          ? 'This charge is being taken right now and can no longer be stopped'
          : `This charge is already ${existing.status}`
      );
    }

    // Guarded in a transaction, not by the read above: a charge job running
    // right now could claim the lease between that read and this write.
    const charge =
      data.status === 'waived'
        ? await LessonScheduledChargeRepository.tryWaive(
            data.id,
            data.waivedReason ?? '',
            adminUid
          )
        : await LessonScheduledChargeRepository.tryCancel(data.id);

    if (!charge) {
      throwInvalidArgument(
        'This charge was taken while you were looking at it — reload to see where it landed'
      );
    }

    return { charge };
  });
