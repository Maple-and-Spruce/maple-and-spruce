/**
 * Get POS Lesson Attribution Summary Cloud Function (legacy #628)
 *
 * Lightweight status counts for the nav badge (pending count) — mirrors
 * getSyncConflictSummary.
 */
import { PosLessonAttributionRepository } from '@maple/firebase/database';
import type {
  GetPosLessonAttributionSummaryRequest,
  GetPosLessonAttributionSummaryResponse,
} from '@maple/ts/firebase/api-types';

export async function getPosLessonAttributionSummary(
  _data: GetPosLessonAttributionSummaryRequest,
): Promise<GetPosLessonAttributionSummaryResponse> {
  const summary = await PosLessonAttributionRepository.getSummary();
  return { summary };
}
