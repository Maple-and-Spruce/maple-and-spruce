/**
 * Get POS Lesson Attribution Summary Cloud Function (#628)
 *
 * Lightweight status counts for the nav badge (pending count) — mirrors
 * getSyncConflictSummary.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { PosLessonAttributionRepository } from '@maple/firebase/database';
import type {
  GetPosLessonAttributionSummaryRequest,
  GetPosLessonAttributionSummaryResponse,
} from '@maple/ts/firebase/api-types';

export const getPosLessonAttributionSummary = createAdminFunction<
  GetPosLessonAttributionSummaryRequest,
  GetPosLessonAttributionSummaryResponse
>(async () => {
  const summary = await PosLessonAttributionRepository.getSummary();
  return { summary };
});
