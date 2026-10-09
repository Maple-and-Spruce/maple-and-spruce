/**
 * Get POS Lesson Attributions Cloud Function (legacy #628)
 *
 * Lists the in-person Square POS lesson sales captured by `processPosSale`,
 * optionally filtered by status, for the admin review queue.
 */
import { PosLessonAttributionRepository } from '@maple/firebase/database';
import type {
  GetPosLessonAttributionsRequest,
  GetPosLessonAttributionsResponse,
} from '@maple/ts/firebase/api-types';

export async function getPosLessonAttributions(
  data: GetPosLessonAttributionsRequest,
): Promise<GetPosLessonAttributionsResponse> {
  const attributions = await PosLessonAttributionRepository.findAll({
    status: data.status,
  });
  return { attributions };
}
