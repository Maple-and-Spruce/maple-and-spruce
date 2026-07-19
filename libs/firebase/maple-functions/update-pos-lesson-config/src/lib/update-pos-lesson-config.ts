/**
 * Update POS Lesson Config Cloud Function (#628)
 *
 * Sets which Square catalog object ids count as music lessons at the POS.
 * De-dupes and trims the ids; stamps the editor uid.
 */
import {
  createAdminFunction,
  throwInvalidArgument,
} from '@maple/firebase/functions';
import { PosLessonConfigRepository } from '@maple/firebase/database';
import type {
  UpdatePosLessonConfigRequest,
  UpdatePosLessonConfigResponse,
} from '@maple/ts/firebase/api-types';

export const updatePosLessonConfig = createAdminFunction<
  UpdatePosLessonConfigRequest,
  UpdatePosLessonConfigResponse
>(async (data, context) => {
  if (!Array.isArray(data.lessonCatalogObjectIds)) {
    throwInvalidArgument('lessonCatalogObjectIds must be an array');
  }

  const cleaned = [
    ...new Set(
      data.lessonCatalogObjectIds
        .map((id) => (typeof id === 'string' ? id.trim() : ''))
        .filter((id) => id.length > 0)
    ),
  ];

  const config = await PosLessonConfigRepository.setLessonCatalogObjectIds(
    cleaned,
    context.uid
  );
  return { config };
});
