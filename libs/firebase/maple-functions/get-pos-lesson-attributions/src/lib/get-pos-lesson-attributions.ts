/**
 * Get POS Lesson Attributions Cloud Function (#628)
 *
 * Lists the in-person Square POS lesson sales captured by `processPosSale`,
 * optionally filtered by status, for the admin review queue.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { PosLessonAttributionRepository } from '@maple/firebase/database';
import type {
  GetPosLessonAttributionsRequest,
  GetPosLessonAttributionsResponse,
} from '@maple/ts/firebase/api-types';

export const getPosLessonAttributions = createAdminFunction<
  GetPosLessonAttributionsRequest,
  GetPosLessonAttributionsResponse
>(async (data) => {
  const attributions = await PosLessonAttributionRepository.findAll({
    status: data.status,
  });
  return { attributions };
});
