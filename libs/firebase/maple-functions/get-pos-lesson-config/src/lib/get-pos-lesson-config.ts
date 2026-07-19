/**
 * Get POS Lesson Config Cloud Function (#628)
 *
 * Returns the Square catalog object ids that count as music lessons at the
 * POS, for the admin config manager.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { PosLessonConfigRepository } from '@maple/firebase/database';
import type {
  GetPosLessonConfigRequest,
  GetPosLessonConfigResponse,
} from '@maple/ts/firebase/api-types';

export const getPosLessonConfig = createAdminFunction<
  GetPosLessonConfigRequest,
  GetPosLessonConfigResponse
>(async () => {
  const config = await PosLessonConfigRepository.get();
  return { config };
});
